import { Component, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Shown in the fallback heading, e.g. "לוח תוכן שבועי" — lets one admin see at a glance which
   * tab/feature crashed without needing to open devtools. */
  label: string;
}

interface State {
  error: Error | null;
}

/**
 * React error boundaries can only be class components (there is no hook equivalent as of React
 * 19) — this is the ONLY reason this file isn't a function component like everything else here.
 *
 * Without this, an uncaught render error anywhere in a tab's component tree unmounts that whole
 * subtree and React stops painting it — nothing crashes visibly, there's just nothing there
 * anymore. Since every tab's dark background (`bg-carbon-950`/`dash-card`) lives on a container
 * ABOVE the crash point, what's left on screen is a plain dark panel with no content and no error
 * message — which reads exactly like a frozen/stuck overlay, not a crash. This boundary catches
 * that and renders an actual explanation + a retry button instead.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error(`[ErrorBoundary:${this.props.label}] render error:`, error, info.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="dash-card p-8 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-3" />
          <h3 className="font-display font-bold text-white text-base mb-2">{this.props.label} — משהו השתבש</h3>
          <p className="text-zinc-500 text-xs mb-1 max-w-md mx-auto leading-relaxed">
            אירעה שגיאה בטעינת הרכיב הזה — ייתכן שמדובר בנתון חסר או פגום. שאר לוח הבקרה ממשיך לעבוד כרגיל.
          </p>
          <p className="text-zinc-700 text-[11px] font-mono mb-4">{this.state.error.message}</p>
          <button
            onClick={this.reset}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-zinc-300 text-xs font-bold cursor-pointer hover:bg-white/10"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            נסה שוב
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
