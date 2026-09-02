import { Component, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Short label for the fallback heading, e.g. "תצוגת הקרוסלה". */
  label: string;
  /**
   * When any value in this array changes, the boundary clears its error state automatically —
   * so a fresh generation / edit recovers the preview without the operator pressing "retry".
   */
  resetKeys?: unknown[];
  /** Called on manual retry (and on resetKeys change) so the parent can clear whatever bad
   * state triggered the crash. Must not throw. */
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

/**
 * Strict LOCAL error boundary for the carousel-preview / story-canvas subtree. An uncaught render
 * error here (a malformed slide object, a bad data URL, a race between an async deck update and a
 * re-render) is contained to the preview panel — the article picker, generation controls and the
 * rest of the workspace keep their state and stay interactive. Auto-recovers on the next
 * successful generation via `resetKeys`.
 */
export default class PreviewErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error(`[PreviewErrorBoundary:${this.props.label}]`, error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (!this.state.error) return;
    const a = prev.resetKeys ?? [];
    const b = this.props.resetKeys ?? [];
    if (a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]))) {
      this.setState({ error: null });
    }
  }

  retry = () => {
    try {
      this.props.onReset?.();
    } catch {
      /* onReset must never break recovery */
    }
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="dash-card p-6 text-center">
          <AlertTriangle className="w-6 h-6 text-amber-400 mx-auto mb-2" />
          <h3 className="font-bold text-white text-sm mb-1">{this.props.label} — התאוששות</h3>
          <p className="text-zinc-500 text-[11px] mb-1 max-w-sm mx-auto leading-relaxed">
            אירעה שגיאה בתצוגה המקדימה (נתון חסר או תזמון). שאר סביבת העבודה — בחירת הכתבה, הטקסט וההגדרות — נשמרה במלואה.
          </p>
          <p className="text-zinc-700 text-[10px] font-mono mb-3 truncate">{this.state.error.message}</p>
          <button
            onClick={this.retry}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-300 text-xs font-bold cursor-pointer hover:bg-white/10"
          >
            <RotateCcw className="w-3.5 h-3.5" /> רענון התצוגה
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
