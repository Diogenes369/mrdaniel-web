import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * The site had no error boundary at all, so ANY render error — or a rejected `lazy()` import —
 * unmounted the whole React tree and left the visitor on a blank page. Two real triggers:
 *   • `Scene3D` is `lazy()`. After a deploy, a visitor holding the previous index.html requests a
 *     chunk hash that no longer exists; the import rejects and took the entire site down with it,
 *     for a decorative background.
 *   • A page component throwing on unexpected API data (see NewsArticlePage's `summary` guard).
 *
 * `fallback` decides what replaces the subtree: `null` for decoration (the scene just isn't
 * there), a message for page content. `resetKey` clears the error when it changes — the route
 * boundary passes the pathname, so navigating away from a broken page recovers without a reload.
 */
interface Props {
  children: ReactNode;
  fallback: ReactNode | ((reset: () => void) => ReactNode);
  resetKey?: string;
  /** Tag for the console line, so a report says which boundary caught it. */
  name: string;
}

interface State {
  error: Error | null;
  resetKey?: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.name}] render error caught by boundary:`, error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    const { fallback } = this.props;
    return typeof fallback === 'function' ? fallback(this.reset) : fallback;
  }
}

/** The page-level fallback: keeps the header/footer around it, offers a retry and a way home. */
export function PageErrorFallback({ onRetry }: { onRetry: () => void }) {
  return (
    <section dir="rtl" role="alert" className="mx-auto flex min-h-[60dvh] max-w-lg flex-col items-center justify-center px-4 py-24 text-center">
      <h1 className="font-display text-2xl font-black text-white md:text-3xl">משהו השתבש בטעינת העמוד</h1>
      <p className="mt-3 text-zinc-400">לפעמים זה קורה מיד אחרי עדכון לאתר. רענון בדרך כלל פותר את זה.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full border border-brand-500 bg-brand-500 px-5 py-2.5 text-sm font-bold text-black hover:bg-brand-400"
        >
          רענון העמוד
        </button>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full border border-white/15 bg-carbon-800/60 px-5 py-2.5 text-sm font-bold text-white hover:border-brand-500/50"
        >
          ניסיון נוסף
        </button>
        <a href="/" className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-bold text-white hover:border-brand-500/50">
          לעמוד הבית
        </a>
      </div>
    </section>
  );
}
