import { useState } from 'react';
import { Loader2, Send, Sparkles, Wand2 } from 'lucide-react';
import type { StoryPayload } from '../lib/storySlides';
import type { SlideFormat } from '../lib/instagramStoryRenderer';
import { editDeck } from '../lib/slideEditor';

const SUGGESTIONS = [
  'תקצר את שקופית 2',
  'תנסח מחדש את שקופית 3 בצורה מותחת יותר',
  'החלף את הניסוח בשקף 1',
];

interface LogEntry {
  instruction: string;
  via: 'ai' | 'local';
  ok: boolean;
  note?: string;
}

interface Props {
  payload: StoryPayload | null;
  format: SlideFormat;
  busy: boolean;
  onApply: (p: StoryPayload) => void | Promise<void>;
}

export default function SlideEditorChat({ payload, format, busy, onApply }: Props) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);

  const disabled = !payload || busy || sending;

  const run = async (instruction: string) => {
    const instr = instruction.trim();
    if (!payload || !instr || sending || busy) return;
    setSending(true);
    try {
      const res = await editDeck(payload, instr);
      if (res.changed) await onApply(res.payload);
      setLog((l) => [{ instruction: instr, via: res.via, ok: res.changed, note: res.note }, ...l].slice(0, 6));
      if (res.changed) setInput('');
    } catch (e) {
      const entry: LogEntry = { instruction: instr, via: 'ai', ok: false, note: (e as Error).message };
      setLog((l) => [entry, ...l].slice(0, 6));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="dash-card p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider">
        <Wand2 className="w-3.5 h-3.5" /> עוזר AI לעריכת תוכן ושקפים
        <span className="text-[10px] text-zinc-600 normal-case tracking-normal">· {format}</span>
      </div>

      <div className="flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void run(input);
            }
          }}
          placeholder='לדוגמה: "תקצר את שקופית 2", "תנסח מחדש את שקף 3 בצורה מותחת", "החלף את שקף 1 ב\"טקסט חדש\""'
          dir="rtl"
          rows={2}
          disabled={!payload}
          className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 leading-relaxed resize-y min-h-[52px] disabled:opacity-50"
        />
        <button
          onClick={() => void run(input)}
          disabled={disabled || input.trim().length < 3}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-500 text-black text-xs font-bold cursor-pointer disabled:opacity-50 shrink-0"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          החל
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => void run(s)}
            disabled={disabled}
            className="text-[11px] px-2 py-1 rounded-md bg-white/5 border border-white/10 text-zinc-300 hover:bg-white/10 disabled:opacity-40 cursor-pointer"
          >
            {s}
          </button>
        ))}
      </div>

      {(sending || busy) && (
        <p className="text-[11px] text-zinc-500 flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" /> {sending ? 'מעבד את ההוראה…' : 'מרנדר מחדש…'}
        </p>
      )}

      {log.length > 0 && (
        <ul className="text-[11px] text-zinc-500 space-y-1 border-t border-white/5 pt-2">
          {log.map((e, i) => (
            <li key={i} className="flex items-start gap-1.5">
              {e.ok ? (
                <Sparkles className={`w-3 h-3 mt-0.5 shrink-0 ${e.via === 'ai' ? 'text-brand-400' : 'text-amber-400/80'}`} />
              ) : (
                <span className="text-amber-400/80 shrink-0">⚠</span>
              )}
              <span className={e.ok ? 'text-zinc-400' : 'text-amber-400/80'}>
                <span className="text-zinc-300">"{e.instruction}"</span>
                {e.ok ? ` — ${e.via === 'ai' ? 'עודכן ע״י AI' : 'עודכן מקומית'}` : ` — ${e.note || 'לא בוצע'}`}
                {e.ok && e.note ? ` (${e.note})` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!payload && <p className="text-[11px] text-zinc-600">צרו קודם קרוסלה — ואז אפשר לערוך אותה כאן בשפה חופשית.</p>}
    </div>
  );
}
