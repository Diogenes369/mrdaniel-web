import { useEffect, useMemo, useState } from 'react';
import {
  Mail,
  Users,
  UserPlus,
  Save,
  Trash2,
  Plus,
  Send,
  Loader2,
  Eye,
  Code2,
  Sparkles,
  History,
  AlertTriangle,
  Check,
} from 'lucide-react';
import { useEmailManager, type EmailTemplate } from '../lib/useEmailManager';

type Audience = 'newsletter' | 'leads' | 'all';
const AUDIENCE_LABEL: Record<Audience, string> = { newsletter: 'מנויי ניוזלטר', leads: 'לידים', all: 'כולם' };

const STARTER_HTML = `<p style="margin:0 0 14px;color:#ffffff;font-size:18px;font-weight:700;">כותרת העדכון</p>
<p style="margin:0 0 14px;">גוף ההודעה — טקסט חופשי, אפשר קישורים ו-HTML בסיסי. התוכן ייעטף אוטומטית בתבנית הממותגת של MR. DANIEL.</p>
<p style="margin:0;"><a href="https://mrdaniel.co.il" style="display:inline-block;background:#76B900;color:#0b0f0e;font-weight:800;text-decoration:none;padding:12px 22px;border-radius:10px;">קריאה לפעולה</a></p>`;

function timeLabel(ts: number): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** Mirrors src/server/emailEngine.ts wrapBrandedEmail — for the live preview only. */
function previewDoc(inner: string, subject: string): string {
  return `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"></head>
<body style="margin:0;background:#0b0f0e;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" style="background:#0b0f0e;padding:20px 0"><tr><td align="center">
<table role="presentation" width="600" style="max-width:600px;width:100%;background:#111614;border:1px solid #23302a;border-radius:16px;overflow:hidden">
<tr><td style="background:#0d1210;padding:20px 26px;border-bottom:2px solid #76B900"><span style="color:#fff;font-size:19px;font-weight:800;letter-spacing:1px">MR. DANIEL</span></td></tr>
<tr><td style="padding:26px;color:#d7dbd8;font-size:15px;line-height:1.8">${inner}</td></tr>
<tr><td style="padding:16px 26px;border-top:1px solid #23302a;color:#7c847f;font-size:12px">דניאל בן ברוך · <a href="https://mrdaniel.co.il" style="color:#76B900;text-decoration:none">mrdaniel.co.il</a></td></tr>
</table></td></tr></table></body></html>`;
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number | string }) {
  return (
    <div className="dash-card p-4">
      <span className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-500 uppercase tracking-wide mb-1.5">
        <Icon className="w-3 h-3" /> {label}
      </span>
      <span className="block font-display font-black text-2xl text-white tabular-nums">{value}</span>
    </div>
  );
}

export default function EmailManagerPanel() {
  const { templates, config, campaigns, subscriberCount, leadCount, audienceSize, loaded, saveTemplate, deleteTemplate, saveConfig, sendTest, sendCampaign } =
    useEmailManager();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [html, setHtml] = useState(STARTER_HTML);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');

  const [audience, setAudience] = useState<Audience>('newsletter');
  const [testTo, setTestTo] = useState('');
  const [busy, setBusy] = useState<'test' | 'campaign' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmBlast, setConfirmBlast] = useState(false);

  const loadTemplate = (t: EmailTemplate) => {
    setEditingId(t.id);
    setName(t.name);
    setSubject(t.subject);
    setHtml(t.html || STARTER_HTML);
  };
  const newTemplate = () => {
    setEditingId(null);
    setName('');
    setSubject('');
    setHtml(STARTER_HTML);
  };

  useEffect(() => {
    setConfirmBlast(false);
  }, [subject, html, audience]);

  const save = () => {
    if (!name.trim()) return;
    const id = saveTemplate({ id: editingId ?? undefined, name: name.trim(), subject: subject.trim(), html });
    setEditingId(id);
    setMsg('התבנית נשמרה ✓');
    window.setTimeout(() => setMsg(null), 2000);
  };

  const runTest = async () => {
    if (!testTo || !subject.trim() || !html.trim()) return;
    setBusy('test');
    setMsg(null);
    const r = await sendTest(testTo.trim(), subject.trim(), html);
    setMsg(r.ok ? 'מייל בדיקה נשלח ✓' : `שליחה נכשלה: ${r.error ?? ''}`);
    setBusy(null);
  };

  const runCampaign = async () => {
    if (!confirmBlast) {
      setConfirmBlast(true);
      return;
    }
    setBusy('campaign');
    setMsg(null);
    const r = await sendCampaign(subject.trim(), html, audience);
    setMsg(r.ok ? `נשלח ל-${r.sent}/${r.total} נמענים` : `נשלח חלקית: ${r.sent ?? 0}/${r.total ?? 0} · ${r.error ?? ''}`);
    setBusy(null);
    setConfirmBlast(false);
  };

  const canSend = Boolean(subject.trim() && html.trim());
  const targetCount = audienceSize[audience];

  const welcomeOptions = useMemo(() => templates, [templates]);

  if (!loaded) return <div className="dash-card p-10 text-center text-zinc-500 text-sm">טוען…</div>;

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="מנויי ניוזלטר" value={subscriberCount} />
        <StatCard icon={UserPlus} label="לידים" value={leadCount} />
        <StatCard icon={Mail} label="קמפיינים שנשלחו" value={campaigns.length} />
        <div className="dash-card p-4">
          <span className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-500 uppercase tracking-wide mb-1.5">
            <Sparkles className="w-3 h-3" /> SMTP
          </span>
          <span className="block text-xs text-zinc-400 leading-relaxed">
            ImprovMX / SMTP מותאם · שולח מ-<span className="text-brand-300 font-mono" dir="ltr">daniel@mrdaniel.co.il</span>
          </span>
        </div>
      </div>

      {/* Auto-welcome */}
      <div className="dash-card p-6">
        <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider mb-4">
          <Sparkles className="w-3.5 h-3.5" /> אוטומציה — מייל ברוכים הבאים
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={() => saveConfig({ autoWelcome: !config.autoWelcome })}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold cursor-pointer ${
              config.autoWelcome ? 'bg-brand-500 text-black' : 'bg-white/10 text-zinc-300 border border-white/15'
            }`}
          >
            <Check className="w-4 h-4" /> {config.autoWelcome ? 'פעיל' : 'כבוי'}
          </button>
          <label className="text-xs text-zinc-400 flex items-center gap-2">
            תבנית:
            <select
              value={config.welcomeTemplateId}
              onChange={(e) => saveConfig({ welcomeTemplateId: e.target.value })}
              className="bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white"
            >
              <option value="">ברירת מחדל (מובנה)</option>
              {welcomeOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <span className="text-[11px] text-zinc-600">נשלח אוטומטית עם כל הרשמה חדשה (ניוזלטר או ליד).</span>
        </div>
      </div>

      {/* Template builder + campaign */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Builder */}
        <div className="dash-card p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <span className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider">
              <Code2 className="w-3.5 h-3.5" /> בונה תבניות מייל
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => loadTemplate(t)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                    editingId === t.id ? 'bg-brand-500 text-black' : 'bg-white/5 text-zinc-400 border border-white/10'
                  }`}
                >
                  {t.name}
                </button>
              ))}
              <button onClick={newTemplate} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white/5 border border-white/10 text-zinc-300 cursor-pointer">
                <Plus className="w-3 h-3" /> חדשה
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="שם התבנית (לשימוש פנימי)"
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600"
            />
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="נושא המייל"
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600"
            />

            <div className="flex items-center gap-2">
              <button onClick={() => setTab('edit')} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${tab === 'edit' ? 'bg-brand-500 text-black' : 'bg-white/5 text-zinc-400 border border-white/10'}`}>
                <Code2 className="w-3.5 h-3.5" /> HTML
              </button>
              <button onClick={() => setTab('preview')} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${tab === 'preview' ? 'bg-brand-500 text-black' : 'bg-white/5 text-zinc-400 border border-white/10'}`}>
                <Eye className="w-3.5 h-3.5" /> תצוגה מקדימה
              </button>
            </div>

            {tab === 'edit' ? (
              <textarea
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                dir="ltr"
                rows={16}
                spellCheck={false}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-[12px] font-mono text-zinc-200 leading-relaxed resize-y min-h-[320px]"
              />
            ) : (
              <iframe title="תצוגה מקדימה" srcDoc={previewDoc(html, subject)} className="w-full min-h-[360px] rounded-lg border border-white/10 bg-white" />
            )}

            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={save} disabled={!name.trim()} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-500 text-black text-xs font-bold cursor-pointer disabled:opacity-50">
                <Save className="w-3.5 h-3.5" /> שמור תבנית
              </button>
              {editingId && (
                <button onClick={() => { deleteTemplate(editingId); newTemplate(); }} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-red-400 text-xs font-bold cursor-pointer">
                  <Trash2 className="w-3.5 h-3.5" /> מחק
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Campaign */}
        <div className="dash-card p-6">
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider mb-4">
            <Send className="w-3.5 h-3.5" /> שליחת קמפיין
          </div>
          <p className="text-[11px] text-zinc-600 mb-4 leading-relaxed">
            נשלח הנושא וה-HTML שבבונה משמאל, עטופים בתבנית הממותגת. הנמענים נאספים אוטומטית מ-<code>newsletter_signups</code> ו/או <code>leads</code> ב-Firebase.
          </p>

          <div className="flex flex-wrap gap-2 mb-4">
            {(['newsletter', 'leads', 'all'] as Audience[]).map((a) => (
              <button
                key={a}
                onClick={() => setAudience(a)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold cursor-pointer ${
                  audience === a ? 'bg-brand-500 text-black' : 'bg-white/5 text-zinc-400 border border-white/10'
                }`}
              >
                {AUDIENCE_LABEL[a]} ({audienceSize[a]})
              </button>
            ))}
          </div>

          <button
            onClick={runCampaign}
            disabled={!canSend || busy === 'campaign' || targetCount === 0}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold cursor-pointer disabled:opacity-50 ${
              confirmBlast ? 'bg-red-500 text-white' : 'bg-brand-500 text-black'
            }`}
          >
            {busy === 'campaign' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {confirmBlast ? `אישור — שלח ל-${targetCount} נמענים` : `שלח קמפיין (${targetCount} נמענים)`}
          </button>

          <div className="mt-4 pt-4 border-t border-white/10">
            <div className="flex flex-wrap gap-2">
              <input
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="מייל לבדיקה"
                dir="ltr"
                className="flex-1 min-w-[180px] bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600"
              />
              <button
                onClick={runTest}
                disabled={!testTo || !canSend || busy === 'test'}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-zinc-300 text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {busy === 'test' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} שלח בדיקה
              </button>
            </div>
          </div>

          {msg && (
            <p className="text-[11px] text-zinc-400 mt-3 flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3" /> {msg}
            </p>
          )}
        </div>
      </div>

      {/* Campaign history */}
      <div className="dash-card p-6">
        <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider mb-4">
          <History className="w-3.5 h-3.5" /> היסטוריית קמפיינים
        </div>
        {campaigns.length === 0 ? (
          <p className="text-zinc-500 text-sm text-center py-8">עדיין לא נשלחו קמפיינים.</p>
        ) : (
          <div className="grid gap-2">
            {campaigns.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-black/30 border border-white/10 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm text-zinc-200 font-bold truncate">{c.subject}</p>
                  <p className="text-[11px] text-zinc-500">
                    {AUDIENCE_LABEL[(c.audience as Audience)] ?? c.audience} · {timeLabel(c.ts)}
                  </p>
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-1 rounded-full border ${
                    c.status === 'sent'
                      ? 'text-brand-300 border-brand-500/40 bg-brand-500/10'
                      : c.status === 'partial'
                        ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
                        : 'text-red-300 border-red-500/40 bg-red-500/10'
                  }`}
                >
                  {c.sent}/{c.total}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
