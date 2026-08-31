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
  Search,
  ChevronDown,
  ChevronUp,
  Newspaper,
  LayoutGrid,
} from 'lucide-react';
import { useEmailManager, type EmailTemplate, type Contact } from '../lib/useEmailManager';
import { fetchTopNews } from '../lib/newsFeedClient';
import { previewShell, servicesHighlightsHtml, featuredNewsHtml, type EmailNewsItem } from '../lib/emailBlocks';

const STARTER_HTML = `<p style="margin:0 0 14px;color:#ffffff;font:700 19px/1.5 Arial,Helvetica,sans-serif;">כותרת העדכון</p>
<p style="margin:0 0 14px;">גוף ההודעה — טקסט חופשי, אפשר קישורים ו-HTML בסיסי. התוכן ייעטף אוטומטית בתבנית הכהה הממותגת של MR. DANIEL.</p>
<p style="margin:0;"><a href="https://mrdaniel.co.il" style="display:inline-block;background:#76B900;background-image:linear-gradient(180deg,#9FE870,#5C9200);color:#0b0f0e;font:800 15px/1 Arial,Helvetica,sans-serif;text-decoration:none;padding:14px 28px;border-radius:12px;box-shadow:0 6px 22px rgba(118,185,0,.35);">קריאה לפעולה&nbsp;&larr;</a></p>`;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const parseEmails = (t: string) => [...new Set(t.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter((s) => EMAIL_RE.test(s)))];

function timeLabel(ts: number): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// -------------------------------------------------------------------------------------------------
// Recipient & contact picker
// -------------------------------------------------------------------------------------------------
type Filter = 'all' | 'lead' | 'newsletter' | 'custom';
const FILTER_LABEL: Record<Filter, string> = { all: 'הכל', lead: 'לידים בלבד', newsletter: 'ניוזלטר בלבד', custom: 'בחירה מותאמת' };

function RecipientPicker({ contacts, onChange }: { contacts: Contact[]; onChange: (emails: string[]) => void }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');

  const scoped = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (filter === 'lead' && c.kind !== 'lead') return false;
      if (filter === 'newsletter' && c.kind !== 'newsletter') return false;
      if (!q) return true;
      return c.email.includes(q) || c.name.toLowerCase().includes(q);
    });
  }, [contacts, filter, search]);

  // 'all' / 'lead' / 'newsletter' → the whole scoped list is the audience unless the user unticks.
  // 'custom' → nothing preselected; user ticks individuals.
  useEffect(() => {
    if (filter === 'custom') setSelected(new Set());
    else setSelected(new Set(scoped.map((c) => c.email)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const bulkEmails = useMemo(() => parseEmails(bulkText), [bulkText]);
  const resolved = useMemo(() => [...new Set([...selected, ...bulkEmails])], [selected, bulkEmails]);

  useEffect(() => onChange(resolved), [resolved, onChange]);

  const toggle = (email: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(email) ? next.delete(email) : next.add(email);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set([...selected, ...scoped.map((c) => c.email)]));
  const deselectAll = () => setSelected(new Set([...selected].filter((e) => !scoped.some((c) => c.email === e))));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'lead', 'newsletter', 'custom'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold cursor-pointer transition-colors ${
              filter === f ? 'bg-brand-500 text-black' : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 border border-white/10'
            }`}
          >
            {FILTER_LABEL[f]}
          </button>
        ))}
        <span className="ms-auto text-xs font-bold text-brand-300 tabular-nums">נבחרו: {resolved.length} נמענים</span>
      </div>

      <div className="relative">
        <Search className="w-3.5 h-3.5 text-zinc-500 absolute right-3 top-1/2 -translate-y-1/2" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש לפי שם או אימייל…"
          className="w-full bg-black/40 border border-white/10 rounded-lg pr-9 pl-3 py-2 text-sm text-white placeholder-zinc-600"
        />
      </div>

      <div className="flex items-center gap-3 text-[11px]">
        <button onClick={selectAll} className="text-brand-400 hover:text-brand-300 font-bold cursor-pointer">בחר הכל ({scoped.length})</button>
        <button onClick={deselectAll} className="text-zinc-400 hover:text-white font-bold cursor-pointer">נקה בחירה</button>
      </div>

      <div className="max-h-56 overflow-y-auto rounded-lg border border-white/10 bg-black/30 divide-y divide-white/5">
        {scoped.length === 0 ? (
          <p className="text-xs text-zinc-600 text-center py-6">אין אנשי קשר תואמים.</p>
        ) : (
          scoped.slice(0, 400).map((c) => (
            <label key={c.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-white/5">
              <input type="checkbox" checked={selected.has(c.email)} onChange={() => toggle(c.email)} className="accent-brand-500 w-4 h-4 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-zinc-200 truncate">{c.name || c.email}</span>
                {c.name && <span className="block text-[11px] text-zinc-500 truncate" dir="ltr">{c.email}</span>}
              </span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${c.kind === 'lead' ? 'bg-sky-500/10 text-sky-300' : 'bg-brand-500/10 text-brand-300'}`}>
                {c.kind === 'lead' ? 'ליד' : 'ניוזלטר'}
              </span>
            </label>
          ))
        )}
      </div>

      <button onClick={() => setBulkOpen((v) => !v)} className="flex items-center gap-1.5 text-xs font-bold text-zinc-400 hover:text-white cursor-pointer">
        {bulkOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        הדבקת רשימה מותאמת {bulkEmails.length > 0 && <span className="text-brand-400">(+{bulkEmails.length})</span>}
      </button>
      {bulkOpen && (
        <textarea
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          dir="ltr"
          rows={3}
          placeholder="one@example.com, two@example.com&#10;three@example.com"
          className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-[12px] font-mono text-zinc-200"
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------------------------------------------
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
  const { templates, config, campaigns, contacts, subscriberCount, leadCount, loaded, saveTemplate, deleteTemplate, saveConfig, sendTest, sendCampaign } =
    useEmailManager();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [html, setHtml] = useState(STARTER_HTML);
  const [tab, setTab] = useState<'edit' | 'preview'>('preview');

  const [withServices, setWithServices] = useState(false);
  const [withNews, setWithNews] = useState(false);
  const [newsItems, setNewsItems] = useState<EmailNewsItem[]>([]);

  const [recipients, setRecipients] = useState<string[]>([]);
  const [testTo, setTestTo] = useState('');
  const [busy, setBusy] = useState<'test' | 'campaign' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmBlast, setConfirmBlast] = useState(false);

  useEffect(() => {
    if (!withNews || newsItems.length) return;
    fetchTopNews(3)
      .then((items) => setNewsItems(items.map((i) => ({ slug: i.slug, link: i.link, title: i.title, excerpt: i.excerpt, image: i.image }))))
      .catch(() => setNewsItems([]));
  }, [withNews, newsItems.length]);

  // Optional Services / Featured-News sections — sent as a separate field so the server's
  // wrapBrandedEmail() drops them in as sibling rows after the body card (matches previewShell).
  const extraSections = useMemo(
    () => `${withServices ? servicesHighlightsHtml('newsletter') : ''}${withNews ? featuredNewsHtml(newsItems, 'newsletter') : ''}`,
    [withServices, withNews, newsItems]
  );
  const previewHtml = useMemo(() => previewShell(html, subject || 'תצוגה מקדימה', extraSections), [html, subject, extraSections]);

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

  useEffect(() => setConfirmBlast(false), [subject, html, recipients, extraSections]);

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
    const r = await sendTest(testTo.trim(), subject.trim(), html, extraSections);
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
    const r = await sendCampaign(subject.trim(), html, recipients, extraSections);
    setMsg(r.ok ? `נשלח ל-${r.sent}/${r.total} נמענים` : `נשלח חלקית: ${r.sent ?? 0}/${r.total ?? 0} · ${r.error ?? ''}`);
    setBusy(null);
    setConfirmBlast(false);
  };

  const canSend = Boolean(subject.trim() && html.trim());

  if (!loaded) return <div className="dash-card p-10 text-center text-zinc-500 text-sm">טוען…</div>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="מנויי ניוזלטר" value={subscriberCount} />
        <StatCard icon={UserPlus} label="לידים" value={leadCount} />
        <StatCard icon={Mail} label="קמפיינים שנשלחו" value={campaigns.length} />
        <div className="dash-card p-4">
          <span className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-500 uppercase tracking-wide mb-1.5">
            <Sparkles className="w-3 h-3" /> SMTP
          </span>
          <span className="block text-xs text-zinc-400 leading-relaxed">
            שולח מ-<span className="text-brand-300 font-mono" dir="ltr">daniel@mrdaniel.co.il</span> · עיצוב כהה ממותג
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
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
          <span className="text-[11px] text-zinc-600">נשלח אוטומטית עם כל הרשמה חדשה (ניוזלטר או ליד).</span>
        </div>
      </div>

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
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם התבנית (פנימי)" className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600" />
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="נושא המייל" className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600" />

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <button onClick={() => setTab('edit')} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${tab === 'edit' ? 'bg-brand-500 text-black' : 'bg-white/5 text-zinc-400 border border-white/10'}`}>
                  <Code2 className="w-3.5 h-3.5" /> HTML
                </button>
                <button onClick={() => setTab('preview')} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${tab === 'preview' ? 'bg-brand-500 text-black' : 'bg-white/5 text-zinc-400 border border-white/10'}`}>
                  <Eye className="w-3.5 h-3.5" /> תצוגה מקדימה
                </button>
              </div>
              <label className="flex items-center gap-1.5 text-[11px] text-zinc-300 cursor-pointer">
                <input type="checkbox" checked={withServices} onChange={(e) => setWithServices(e.target.checked)} className="accent-brand-500 w-3.5 h-3.5" />
                <LayoutGrid className="w-3 h-3" /> בלוק שירותים
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-zinc-300 cursor-pointer">
                <input type="checkbox" checked={withNews} onChange={(e) => setWithNews(e.target.checked)} className="accent-brand-500 w-3.5 h-3.5" />
                <Newspaper className="w-3 h-3" /> חדשות מובילות (3)
              </label>
            </div>

            {tab === 'edit' ? (
              <textarea value={html} onChange={(e) => setHtml(e.target.value)} dir="ltr" rows={16} spellCheck={false} className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-[12px] font-mono text-zinc-200 leading-relaxed resize-y min-h-[320px]" />
            ) : (
              <iframe title="תצוגה מקדימה" srcDoc={previewHtml} className="w-full min-h-[440px] rounded-lg border border-white/10 bg-[#09090b]" />
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

        {/* Recipients + send */}
        <div className="dash-card p-6">
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider mb-4">
            <Send className="w-3.5 h-3.5" /> נמענים ושליחה
          </div>

          <RecipientPicker contacts={contacts} onChange={setRecipients} />

          <button
            onClick={runCampaign}
            disabled={!canSend || busy === 'campaign' || recipients.length === 0}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold cursor-pointer disabled:opacity-50 mt-4 ${
              confirmBlast ? 'bg-red-500 text-white' : 'bg-brand-500 text-black'
            }`}
          >
            {busy === 'campaign' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {confirmBlast ? `אישור — שלח ל-${recipients.length} נמענים` : `שלח קמפיין (${recipients.length} נמענים)`}
          </button>

          <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap gap-2">
            <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="מייל לבדיקה" dir="ltr" className="flex-1 min-w-[180px] bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600" />
            <button onClick={runTest} disabled={!testTo || !canSend || busy === 'test'} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-zinc-300 text-xs font-bold cursor-pointer disabled:opacity-50">
              {busy === 'test' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} שלח בדיקה
            </button>
          </div>

          {msg && (
            <p className="text-[11px] text-zinc-400 mt-3 flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3" /> {msg}
            </p>
          )}
        </div>
      </div>

      {/* History */}
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
                  <p className="text-[11px] text-zinc-500">{timeLabel(c.ts)}</p>
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
