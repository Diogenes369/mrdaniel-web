import { useCallback, useState } from 'react';
import {
  MessageCircleReply,
  Plus,
  Pencil,
  Trash2,
  Power,
  Copy,
  Check,
  Link2,
  Tag,
  Users,
  X,
} from 'lucide-react';
import {
  useCommentDmManager,
  NEW_CAMPAIGN_DRAFT,
  DM_MERGE_TAGS,
  type CommentDmCampaign,
  type CommentDmCampaignDraft,
} from '../lib/useCommentDmManager';

// Authoring + tracking panel for the Instagram Comment-to-DM flow. ManyChat is the automation
// engine — it watches @mrdaniel.co.il's posts for a comment keyword, auto-replies publicly, and
// DMs the lead — then calls POST /api/leads {action:'manychat-lead'} which is already live. This
// panel is where Daniel defines each campaign (keyword → guide → DM copy) to paste into ManyChat's
// flow builder, and see live counts from the leads it already sends here.

function fmtTs(ts: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function CopyChip({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(() => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      } catch {
        /* clipboard blocked */
      }
    })();
  }, [text]);
  return (
    <button
      onClick={onCopy}
      disabled={!text.trim()}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-zinc-200 text-[11px] font-bold cursor-pointer hover:bg-white/10 disabled:opacity-40"
    >
      {copied ? <Check className="w-3 h-3 text-brand-400" /> : <Copy className="w-3 h-3" />}
      {copied ? 'הועתק ✓' : label}
    </button>
  );
}

function CampaignEditor({
  initial,
  onCancel,
  onSave,
}: {
  initial: CommentDmCampaignDraft;
  onCancel: () => void;
  onSave: (draft: CommentDmCampaignDraft) => void;
}) {
  const [draft, setDraft] = useState<CommentDmCampaignDraft>(initial);
  const patch = (p: Partial<CommentDmCampaignDraft>) => setDraft((d) => ({ ...d, ...p }));
  const insertTag = (field: 'dmTemplate' | 'publicReplyTemplate', tag: string) =>
    patch({ [field]: `${draft[field]}${draft[field] && !draft[field].endsWith('\n') ? ' ' : ''}${tag}` } as Partial<CommentDmCampaignDraft>);

  const canSave = draft.label.trim() && draft.keyword.trim();

  return (
    <div className="rounded-lg border border-brand-500/30 bg-black/40 p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] text-zinc-500 font-mono uppercase tracking-wider mb-1 block">שם קמפיין (פנימי)</label>
          <input
            value={draft.label}
            onChange={(e) => patch({ label: e.target.value })}
            dir="rtl"
            placeholder="לדוגמה: קרוסלה אוטומציות · 12/9"
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200"
          />
        </div>
        <div>
          <label className="text-[11px] text-zinc-500 font-mono uppercase tracking-wider mb-1 block">מילת טריגר</label>
          <input
            value={draft.keyword}
            onChange={(e) => patch({ keyword: e.target.value })}
            dir="rtl"
            placeholder="מדריך"
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200"
          />
        </div>
        <div>
          <label className="text-[11px] text-zinc-500 font-mono uppercase tracking-wider mb-1 block">מזהה מדריך (slug / guideId)</label>
          <input
            value={draft.guideSlug}
            onChange={(e) => patch({ guideSlug: e.target.value })}
            dir="ltr"
            placeholder="ai-business-automations-2026"
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 font-mono"
          />
        </div>
        <div>
          <label className="text-[11px] text-zinc-500 font-mono uppercase tracking-wider mb-1 block">קישור לפוסט (אופציונלי)</label>
          <input
            value={draft.postUrl}
            onChange={(e) => patch({ postUrl: e.target.value })}
            dir="ltr"
            placeholder="https://instagram.com/p/…"
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200"
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] text-zinc-500 font-mono uppercase tracking-wider">תגובה ציבורית אוטומטית</label>
          <CopyChip text={draft.publicReplyTemplate} label="העתק" />
        </div>
        <textarea
          value={draft.publicReplyTemplate}
          onChange={(e) => patch({ publicReplyTemplate: e.target.value })}
          dir="rtl"
          rows={2}
          className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 leading-relaxed resize-y"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <label className="text-[11px] text-zinc-500 font-mono uppercase tracking-wider">תבנית DM</label>
          <div className="flex items-center gap-1.5 flex-wrap">
            {DM_MERGE_TAGS.map((tag) => (
              <button
                key={tag}
                onClick={() => insertTag('dmTemplate', tag)}
                dir="ltr"
                className="px-2 py-0.5 rounded-md bg-brand-500/10 border border-brand-500/30 text-brand-300 text-[10px] font-mono cursor-pointer hover:bg-brand-500/20"
              >
                {tag}
              </button>
            ))}
            <CopyChip text={draft.dmTemplate} label="העתק" />
          </div>
        </div>
        <textarea
          value={draft.dmTemplate}
          onChange={(e) => patch({ dmTemplate: e.target.value })}
          dir="rtl"
          rows={5}
          className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 leading-relaxed resize-y"
        />
        <p className="text-[10px] text-zinc-600 mt-1">
          תגי המיזוג נפתרים בפועל ע"י ManyChat כשההודעה נשלחת — הדביקו את הטקסט בבונה הפלואו שם.
        </p>
      </div>

      <div className="flex items-center justify-between pt-1">
        <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer select-none">
          <input type="checkbox" checked={draft.active} onChange={(e) => patch({ active: e.target.checked })} />
          קמפיין פעיל
        </label>
        <div className="flex items-center gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-300 text-xs font-bold cursor-pointer hover:bg-white/10">
            ביטול
          </button>
          <button
            onClick={() => canSave && onSave(draft)}
            disabled={!canSave}
            className="px-4 py-1.5 rounded-lg bg-brand-500 text-black text-xs font-bold cursor-pointer disabled:opacity-40"
          >
            שמירה
          </button>
        </div>
      </div>
    </div>
  );
}

function CampaignRow({
  campaign,
  leadCount,
  lastTs,
  onEdit,
  onDelete,
  onToggle,
}: {
  campaign: CommentDmCampaign;
  leadCount: number;
  lastTs: number;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  return (
    <div className={`rounded-lg border p-3 ${campaign.active ? 'border-white/10 bg-black/30' : 'border-white/5 bg-black/10 opacity-60'}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-zinc-100">{campaign.label || '(ללא שם)'}</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-500/10 border border-brand-500/30 text-brand-300 text-[10px] font-mono">
              <Tag className="w-2.5 h-2.5" /> {campaign.keyword}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-zinc-500 flex-wrap">
            {campaign.guideSlug && <span dir="ltr" className="font-mono">/g/{campaign.guideSlug}</span>}
            {campaign.postUrl && (
              <a href={campaign.postUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-zinc-400 hover:text-zinc-200">
                <Link2 className="w-3 h-3" /> פוסט
              </a>
            )}
            <span className="inline-flex items-center gap-1">
              <Users className="w-3 h-3" /> {leadCount} לידים{lastTs ? ` · עדכון אחרון ${fmtTs(lastTs)}` : ''}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={onToggle} title={campaign.active ? 'השבתה' : 'הפעלה'} className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-300 cursor-pointer hover:bg-white/10">
            <Power className={`w-3.5 h-3.5 ${campaign.active ? 'text-brand-400' : 'text-zinc-600'}`} />
          </button>
          <button onClick={onEdit} title="עריכה" className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-300 cursor-pointer hover:bg-white/10">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} title="מחיקה" className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-red-400 cursor-pointer hover:bg-red-500/10">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CommentDmPanel() {
  const { campaigns, loaded, statsFor, totalLeads, saveCampaign, deleteCampaign, toggleActive } = useCommentDmManager();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const editing = editingId ? campaigns.find((c) => c.id === editingId) ?? null : null;

  return (
    <div className="dash-card p-6">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <span className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider">
          <MessageCircleReply className="w-3.5 h-3.5" /> תגובה בקומנט ← DM אוטומטי
          {totalLeads > 0 && <span className="text-[10px] normal-case tracking-normal text-brand-400">{totalLeads} לידים סה"כ</span>}
        </span>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 text-black text-xs font-bold cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> קמפיין חדש
          </button>
        )}
      </div>

      <p className="text-xs text-zinc-500 leading-relaxed mb-4">
        האוטומציה בפועל (זיהוי קומנט, תגובה ציבורית ושליחת ה-DM) רצה ב-ManyChat. הפאנל הזה הוא מקור האמת לקמפיינים — מילת טריגר, המדריך
        שמשויך אליה, ותבניות הטקסט — כדי להדביק ישירות בבונה הפלואו של ManyChat, ולראות כמה לידים כל קמפיין הביא (מתוך{' '}
        <code dir="ltr" className="text-zinc-400">/api/leads</code> שה-Webhook כבר כותב אליו).
      </p>

      {creating && (
        <div className="mb-4">
          <CampaignEditor
            initial={NEW_CAMPAIGN_DRAFT}
            onCancel={() => setCreating(false)}
            onSave={(draft) => {
              saveCampaign(draft);
              setCreating(false);
            }}
          />
        </div>
      )}

      {editing && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-zinc-500 font-mono uppercase tracking-wider">עריכת קמפיין</span>
            <button onClick={() => setEditingId(null)} className="p-1 rounded-md text-zinc-500 hover:text-zinc-300 cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <CampaignEditor
            initial={editing}
            onCancel={() => setEditingId(null)}
            onSave={(draft) => {
              saveCampaign(draft, editing.id);
              setEditingId(null);
            }}
          />
        </div>
      )}

      {!loaded ? (
        <p className="text-xs text-zinc-600">טוען…</p>
      ) : campaigns.length === 0 && !creating ? (
        <p className="text-xs text-zinc-600 leading-relaxed">
          אין עדיין קמפיינים. "קמפיין חדש" מגדיר מילת טריגר, מדריך יעד, ותבניות לתגובה הציבורית ול-DM — להדביק בבונה הפלואו של ManyChat.
        </p>
      ) : (
        <div className="space-y-2.5">
          {campaigns.map((c) => {
            const s = statsFor(c.keyword);
            return (
              <CampaignRow
                key={c.id}
                campaign={c}
                leadCount={s?.leadCount ?? 0}
                lastTs={s?.lastTs ?? 0}
                onEdit={() => {
                  setCreating(false);
                  setEditingId(c.id);
                }}
                onDelete={() => {
                  if (editingId === c.id) setEditingId(null);
                  deleteCampaign(c.id);
                }}
                onToggle={() => toggleActive(c)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
