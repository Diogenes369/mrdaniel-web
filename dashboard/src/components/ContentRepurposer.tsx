import { useCallback, useMemo, useState } from 'react';
import {
  Link2,
  Type,
  Loader2,
  Download,
  AlertTriangle,
  Film,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  MessageCircle,
  Sparkles,
  Image as ImageIcon,
} from 'lucide-react';
import type { NewsTopic } from '../lib/newsAgentTypes';
import { renderSlidesForText, type SlideFormat, type RenderedDeck, type SlidePreset } from '../lib/instagramStoryRenderer';
import { renderBrandedCard, type CardFormat } from '../lib/brandedCardRenderer';
import { buildWhatsappPayload, deterministicWhatsappBody, type WhatsappPayload } from '../lib/whatsappPayload';
import { importUrl, synthesizeChannelPost, parseRawText, stripAuthorNoise } from '../lib/repurposeApi';
import PreviewErrorBoundary from './PreviewErrorBoundary';
import QuickPublishBar from './QuickPublishBar';
import GrowthScorePanel from './GrowthScorePanel';
import { deckToCaption } from '../lib/socialPublish';
import { rerenderDeck } from '../lib/instagramStoryRenderer';
import { applySlideEdits, canInsertContentSlide, insertContentSlide, type StoryPayload } from '../lib/storySlides';
import { deckToGrowthContent } from '../lib/growthPlaybook';

const TOPICS: { id: NewsTopic; label: string }[] = [
  { id: 'ai', label: 'AI / בינה מלאכותית' },
  { id: 'ai_models', label: 'מודלי AI וחידושים' },
  { id: 'ai_agents', label: 'סוכני AI' },
  { id: 'general', label: 'AI כללי' },
];

type TargetKind = 'visual' | 'whatsapp';
interface Target {
  id: string;
  label: string;
  hint: string;
  kind: TargetKind;
  format?: SlideFormat;
}
const TARGETS: Target[] = [
  { id: 'reels', label: 'טיקטוק / ריל / סטורי', hint: '9:16 אנכי', kind: 'visual', format: '9:16' },
  { id: 'ig-carousel', label: 'קרוסלת אינסטגרם', hint: '4:5', kind: 'visual', format: '4:5' },
  { id: 'square', label: 'ריבוע (IG / LinkedIn)', hint: '1:1', kind: 'visual', format: '1:1' },
  { id: 'linkedin-carousel', label: 'קרוסלת LinkedIn', hint: '4:5 · PDF/תמונות', kind: 'visual', format: '4:5' },
  { id: 'whatsapp', label: 'עדכון לקהילת WhatsApp', hint: 'טקסט + נכס ויזואלי ממותג', kind: 'whatsapp' },
];

const DESIGN_STYLES: { id: SlidePreset; label: string; hint: string }[] = [
  { id: 'photo', label: 'תמונה כהה', hint: 'רקע צילום/גרפי כהה — הסגנון הקיים' },
  { id: 'vintage', label: 'כרטיס וינטג׳ מאויר', hint: 'שלט מקורי + כותרת דו-גונית + כרטיס הסבר על רקע קרם' },
];

/** Instagram post/reel links — the scraper cannot reach these (Instagram serves an empty JS shell
 *  to any unauthenticated fetch, confirmed 2026-09-15), so a detected link routes the operator to
 *  the manual-paste box instead of silently importing nothing, mirroring the LinkedIn-blocked note. */
const INSTAGRAM_POST_URL = /instagram\.com\/(?:p|reel|tv)\/[A-Za-z0-9_-]+/i;

const PREVIEW_DIMS: Record<SlideFormat, { w: number; h: number }> = {
  '9:16': { w: 288, h: 512 },
  '4:5': { w: 340, h: 425 },
  '1:1': { w: 380, h: 380 },
};
const CARD_DIMS: Record<CardFormat, { w: number; h: number }> = {
  '1:1': { w: 380, h: 380 },
  '9:16': { w: 288, h: 512 },
};

export default function ContentRepurposer() {
  const [importMode, setImportMode] = useState<'url' | 'text'>('url');
  const [urlInput, setUrlInput] = useState('');
  const [rawText, setRawText] = useState('');

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sourceLabel, setSourceLabel] = useState('');
  const [sourceLink, setSourceLink] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [importVia, setImportVia] = useState<string | null>(null);

  const [topic, setTopic] = useState<NewsTopic>('ai');
  const [targetId, setTargetId] = useState<string>('reels');
  const [cardFormat, setCardFormat] = useState<CardFormat>('1:1');
  const [visualPreset, setVisualPreset] = useState<SlidePreset>('photo');

  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [deck, setDeck] = useState<RenderedDeck | null>(null);
  const [activeSlide, setActiveSlide] = useState(0);

  const [wa, setWa] = useState<WhatsappPayload | null>(null);
  const [cardImg, setCardImg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Growth-optimised caption from the Growth panel ('' = none yet / panel unmounted).
  const [growthCaption, setGrowthCaption] = useState('');

  const target = useMemo(() => TARGETS.find((t) => t.id === targetId) ?? TARGETS[0], [targetId]);
  const topicLabel = TOPICS.find((t) => t.id === topic)?.label ?? 'טכנולוגיה';

  const resetOutputs = () => {
    setDeck(null);
    setActiveSlide(0);
    setWa(null);
    setCardImg(null);
    setError(null);
  };

  const runImport = useCallback(async () => {
    if (INSTAGRAM_POST_URL.test(urlInput)) {
      setError(null);
      setNotice(
        'אינסטגרם חוסם גישה אוטומטית לפוסטים (גם דרך הדפדפן) — אין דרך לחלץ את הכיתוב אוטומטית. עברו ל"הדבקת טקסט" והדביקו את כיתוב הפוסט ידנית.'
      );
      setImportMode('text');
      return;
    }
    setImporting(true);
    setError(null);
    setNotice(null);
    try {
      const c = await importUrl(urlInput);
      setTitle(stripAuthorNoise(c.title || '').replace(/\s*[|｜]\s*[^|]{2,40}$/u, '').trim());
      setBody(c.body || '');
      setSourceLabel(c.source || '');
      setSourceLink(c.url || urlInput.trim());
      setImageUrl(c.image || '');
      setImportVia(c.via);
      resetOutputs();
      if (c.via === 'jina') setNotice('התוכן חולץ דרך שירות קריאה חיצוני — מומלץ לעבור על הטקסט.');
      if ((c.body || '').length < 200)
        setNotice('חולץ תוכן חלקי בלבד (LinkedIn חוסם סורקים) — השלימו את גוף הטקסט ידנית.');
    } catch (e) {
      setError((e as Error).message || 'הייבוא נכשל.');
    } finally {
      setImporting(false);
    }
  }, [urlInput]);

  const applyRawText = () => {
    const p = parseRawText(rawText);
    setTitle(p.title);
    setBody(p.body);
    setSourceLink(p.link);
    setSourceLabel(p.link ? new URL(p.link).hostname.replace(/^www\./, '') : 'טקסט חופשי');
    setImageUrl('');
    setImportVia('manual');
    resetOutputs();
  };

  const generate = useCallback(async () => {
    const text = body.trim();
    if (text.length < 60) {
      setError('צריך לפחות 60 תווים של גוף טקסט כדי לשכתב וליצור נכסים.');
      return;
    }
    setBusy(true);
    resetOutputs();
    try {
      if (target.kind === 'visual') {
        // The imported body ALWAYS goes through AI synthesis inside renderSlidesForText (LLM
        // first, dense deterministic fallback on 429). The scraped media image seeds the bg;
        // when absent the renderer resolves a topic stock photo — branding is applied regardless.
        const d = await renderSlidesForText(stripAuthorNoise(text), {
          title: stripAuthorNoise(title.trim()) || undefined,
          topic,
          format: target.format ?? '9:16',
          imageUrl: imageUrl || undefined,
          preset: visualPreset,
        });
        setDeck(d);
      } else {
        // WhatsApp: synthesise mobile-native copy via Gemini; on failure fall back to a
        // deterministic RESHAPE (hook + 2 paragraphs + CTA) — never the raw pasted text.
        let waBody: string;
        let hashtags: string[] = [];
        try {
          const synth = await synthesizeChannelPost({
            title: title.trim(),
            source: sourceLabel || 'טקסט חופשי',
            topic,
            articleText: text,
            variant: 'whatsapp',
          });
          waBody = synth.body;
          hashtags = synth.hashtags;
        } catch (e) {
          setNotice(`שכתוב ה-AI לא זמין (${(e as Error).message}) — נבנה עדכון מקומי משוכתב מהמקור.`);
          waBody = deterministicWhatsappBody(text, title.trim());
        }
        // Branding enforcement: no original author credit / social-network noise in the output.
        waBody = stripAuthorNoise(waBody);
        const payload = buildWhatsappPayload({ title: stripAuthorNoise(title.trim()), body: waBody, hashtags, link: sourceLink });
        setWa(payload);
        const subtitle = payload.bodyText.split('\n').map((l) => l.trim()).filter(Boolean)[0] || '';
        const card = await renderBrandedCard({
          title: stripAuthorNoise(title.trim()) || subtitle.slice(0, 80),
          subtitle: subtitle.slice(0, 160),
          kicker: `עדכון קהילה · ${topicLabel}`,
          format: cardFormat,
        });
        setCardImg(card);
      }
    } catch (e) {
      setError((e as Error).message || 'יצירת הנכסים נכשלה.');
    } finally {
      setBusy(false);
    }
  }, [body, title, topic, target, sourceLabel, sourceLink, cardFormat, topicLabel, imageUrl, visualPreset]);

  const regenCard = useCallback(
    async (fmt: CardFormat) => {
      setCardFormat(fmt);
      if (!wa) return;
      setBusy(true);
      try {
        const subtitle = wa.bodyText.split('\n').map((l) => l.trim()).filter(Boolean)[0] || '';
        const card = await renderBrandedCard({
          title: stripAuthorNoise(title.trim()) || subtitle.slice(0, 80),
          subtitle: subtitle.slice(0, 160),
          kicker: `עדכון קהילה · ${topicLabel}`,
          format: fmt,
        });
        setCardImg(card);
      } finally {
        setBusy(false);
      }
    },
    [wa, title, topicLabel]
  );

  const downloadAllSlides = async () => {
    if (!deck?.images.length) return;
    const slug = (title || 'carousel').replace(/[^\w֐-׿]+/g, '-').slice(0, 40) || 'carousel';
    for (let i = 0; i < deck.images.length; i++) {
      const a = document.createElement('a');
      a.href = deck.images[i];
      a.download = `mrdaniel-${deck.format.replace(':', 'x')}-${slug}-${i + 1}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      await new Promise((r) => setTimeout(r, 350));
    }
  };

  const downloadCard = () => {
    if (!cardImg) return;
    const slug = (title || 'whatsapp').replace(/[^\w֐-׿]+/g, '-').slice(0, 40) || 'whatsapp';
    const a = document.createElement('a');
    a.href = cardImg;
    a.download = `mrdaniel-whatsapp-${cardFormat.replace(':', 'x')}-${slug}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const copyWhatsapp = async () => {
    if (!wa) return;
    try {
      await navigator.clipboard.writeText(wa.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — text is visible for manual copy */
    }
  };

  // Growth panel → apply an edited deck and re-render it on the same background (rerenderDeck
  // reuses the photo cached for this deck), the same path Story Studio's slide editor takes.
  const applyDeckEdit = useCallback(
    async (edited: StoryPayload) => {
      if (!deck) return;
      setBusy(true);
      try {
        setDeck(await rerenderDeck(edited, deck.format, deck.preset));
      } catch (e) {
        setError((e as Error).message || 'הרינדור מחדש נכשל.');
      } finally {
        setBusy(false);
      }
    },
    [deck]
  );

  const deckCaption = deck ? deckToCaption(deck.payload) : '';
  const growthContent = useMemo(() => (deck ? deckToGrowthContent(deck.payload, deckCaption) : null), [deck, deckCaption]);

  const applyCoverHook = useCallback(
    (line: string) => {
      if (!deck) return;
      const n = deck.payload.slides.findIndex((s) => s.kind === 'cover') + 1;
      if (n > 0) return applyDeckEdit(applySlideEdits(deck.payload, [{ n, kind: 'cover', text: line }]));
    },
    [deck, applyDeckEdit]
  );
  const addCheatSheetSlide = useCallback((text: string) => (deck ? applyDeckEdit(insertContentSlide(deck.payload, text)) : undefined), [deck, applyDeckEdit]);

  const hasSource = body.trim().length >= 60;

  return (
    <div className="space-y-5">
      {/* 1 · Import */}
      <div className="dash-card p-6">
        <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider mb-4">
          <Link2 className="w-3.5 h-3.5" /> יבוא תוכן / קישור
        </div>
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setImportMode('url')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
              importMode === 'url' ? 'bg-brand-500 text-black' : 'bg-white/5 text-zinc-400 border border-white/10'
            }`}
          >
            <Link2 className="w-3.5 h-3.5" /> קישור (LinkedIn / כתבה)
          </button>
          <button
            onClick={() => setImportMode('text')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
              importMode === 'text' ? 'bg-brand-500 text-black' : 'bg-white/5 text-zinc-400 border border-white/10'
            }`}
          >
            <Type className="w-3.5 h-3.5" /> הדבקת טקסט
          </button>
        </div>

        {importMode === 'url' ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://www.linkedin.com/posts/…  או קישור לכתבה (אינסטגרם: הדביקו טקסט ידנית)"
              dir="ltr"
              className="flex-1 min-w-[260px] bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200"
            />
            <button
              onClick={runImport}
              disabled={importing || urlInput.trim().length < 8}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-500 text-black text-sm font-bold cursor-pointer disabled:opacity-50"
            >
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />} יבא מהקישור
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="הדביקו כאן את גוף הפוסט / הכתבה. שורה ראשונה = כותרת, השאר = גוף. כתובת URL בסוף תזוהה כמקור."
              dir="rtl"
              rows={6}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-zinc-200 leading-relaxed resize-y"
            />
            <button
              onClick={applyRawText}
              disabled={rawText.trim().length < 40}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-500 text-black text-sm font-bold cursor-pointer disabled:opacity-50"
            >
              <Type className="w-4 h-4" /> נתח טקסט
            </button>
          </div>
        )}

        {error && (
          <p className="mt-3 text-xs text-amber-400 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> {error}
          </p>
        )}
        {notice && !error && <p className="mt-3 text-[11px] text-sky-400/90">{notice}</p>}
      </div>

      {/* 2 · Parsed content (editable) */}
      {(title || body || importVia) && (
        <div className="dash-card p-6 space-y-3">
          <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono">
            <span className="text-brand-400 font-bold uppercase tracking-wider">תוכן שחולץ — ניתן לעריכה</span>
            <span>
              {sourceLabel && `מקור: ${sourceLabel}`}
              {importVia && importVia !== 'manual' && ` · ${importVia === 'jina' ? 'קורא חיצוני' : importVia === 'direct' ? 'ישיר' : 'חלקי'}`}
              {imageUrl && ' · תמונה ✓'}
            </span>
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="כותרת"
            dir="rtl"
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-100 font-bold"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="גוף הטקסט — הבסיס לשכתוב ה-AI"
            dir="rtl"
            rows={7}
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-zinc-200 leading-relaxed resize-y"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={topic}
              onChange={(e) => setTopic(e.target.value as NewsTopic)}
              className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200"
            >
              {TOPICS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-zinc-500 font-mono">{body.trim().length} תווים</span>
          </div>
        </div>
      )}

      {/* 3 · Target + generate */}
      {hasSource && (
        <div className="dash-card p-6">
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider mb-3">
            <Sparkles className="w-3.5 h-3.5" /> יעד הפצה
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
            {TARGETS.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setTargetId(t.id);
                  resetOutputs();
                }}
                className={`text-right px-3 py-2 rounded-lg border text-xs cursor-pointer ${
                  targetId === t.id
                    ? 'bg-brand-500 text-black border-brand-500 font-bold'
                    : 'bg-white/5 text-zinc-300 border-white/10 hover:bg-white/10'
                }`}
              >
                <span className="block font-bold">{t.label}</span>
                <span className={`block text-[10px] ${targetId === t.id ? 'text-black/70' : 'text-zinc-500'}`}>{t.hint}</span>
              </button>
            ))}
          </div>

          {target.kind === 'visual' && (
            <div className="flex items-center gap-2 flex-wrap mb-4">
              <span className="text-[11px] text-zinc-500 font-mono">סגנון עיצוב:</span>
              {DESIGN_STYLES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setVisualPreset(s.id);
                    resetOutputs();
                  }}
                  title={s.hint}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                    visualPreset === s.id ? 'bg-brand-500 text-black' : 'bg-white/5 text-zinc-400 border border-white/10'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={generate}
              disabled={busy}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-500 text-black text-sm font-bold cursor-pointer disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              שכתב עם AI וצור נכסים
            </button>
            {target.kind === 'whatsapp' && (
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-zinc-500 font-mono">כרטיס:</span>
                {(['1:1', '9:16'] as CardFormat[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => regenCard(f)}
                    disabled={busy}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold font-mono cursor-pointer disabled:opacity-50 ${
                      cardFormat === f ? 'bg-brand-500 text-black' : 'bg-white/5 text-zinc-400 border border-white/10'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            )}
          </div>
          {notice && <p className="mt-3 text-[11px] text-sky-400/90">{notice}</p>}
          {error && (
            <p className="mt-3 text-xs text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> {error}
            </p>
          )}
        </div>
      )}

      {/* 4a · Visual carousel output */}
      {deck && deck.images.length > 0 && (
        <PreviewErrorBoundary
          label="תצוגת הקרוסלה"
          resetKeys={[deck.payload?.createdAt, deck.format, deck.images.length]}
          onReset={() => {
            setDeck(null);
            setActiveSlide(0);
            setError(null);
          }}
        >
        <div className="dash-card p-6">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <span className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider">
              <Film className="w-3.5 h-3.5" /> {target.label} · {deck.format} · {deck.images.length} שקופיות
              <span className={`text-[10px] normal-case ${deck.payload.synthesized ? 'text-brand-400' : 'text-amber-400/80'}`}>
                {deck.payload.synthesized ? 'טקסט AI' : `גיבוי מקומי${deck.payload.fallbackReason ? ` — ${deck.payload.fallbackReason}` : ''}`}
              </span>
            </span>
            <button
              onClick={downloadAllSlides}
              disabled={busy}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-500 text-black text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" /> הורד את כל השקופיות (PNG)
            </button>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap mb-4">
            {(deck.payload?.slides ?? []).map((s, i) => (
              <button
                key={i}
                onClick={() => setActiveSlide(i)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                  activeSlide === i ? 'bg-brand-500 text-black' : 'bg-white/5 text-zinc-400 border border-white/10'
                }`}
              >
                {i + 1}. {s?.kind === 'cover' ? 'שער' : s?.kind === 'cta' ? 'סיום' : s?.heading || `שקופית ${i + 1}`}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => setActiveSlide((a) => Math.max(0, a - 1))}
              disabled={activeSlide === 0}
              className="p-2 rounded-full bg-white/5 border border-white/10 text-zinc-400 hover:text-white disabled:opacity-30 cursor-pointer"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <div
              className="relative rounded-2xl overflow-hidden border border-white/10 bg-black"
              style={{
                width: (PREVIEW_DIMS[deck.format] ?? PREVIEW_DIMS['9:16']).w,
                height: (PREVIEW_DIMS[deck.format] ?? PREVIEW_DIMS['9:16']).h,
              }}
            >
              {deck.images[Math.min(activeSlide, deck.images.length - 1)] ? (
                <img
                  src={deck.images[Math.min(activeSlide, deck.images.length - 1)]}
                  alt={`שקופית ${activeSlide + 1}`}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-zinc-700">
                  <Film className="w-6 h-6" />
                </div>
              )}
            </div>
            <button
              onClick={() => setActiveSlide((a) => Math.min(deck.images.length - 1, a + 1))}
              disabled={activeSlide >= deck.images.length - 1}
              className="p-2 rounded-full bg-white/5 border border-white/10 text-zinc-400 hover:text-white disabled:opacity-30 cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>

          <QuickPublishBar
            text={growthCaption || deckCaption}
            image={deck.images[Math.min(activeSlide, deck.images.length - 1)]}
            label="פרסום מהיר · קרוסלה"
            className="mt-4 justify-center"
          />

          {growthContent && (
            <GrowthScorePanel
              key={growthContent.contentKey}
              content={growthContent}
              busy={busy}
              onApplyHook={applyCoverHook}
              onAddCheatSheet={addCheatSheetSlide}
              canAddCheatSheet={canInsertContentSlide(deck.payload)}
              onCaptionChange={setGrowthCaption}
              className="mt-4"
            />
          )}
        </div>
        </PreviewErrorBoundary>
      )}

      {/* 4b · WhatsApp Community output */}
      {wa && (
        <div className="dash-card p-6">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <span className="flex items-center gap-2 text-zinc-400 text-xs font-mono uppercase tracking-wider">
              <MessageCircle className="w-3.5 h-3.5" /> עדכון לקהילת WhatsApp
            </span>
            <QuickPublishBar text={wa.text} image={cardImg ?? undefined} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-2">
                <button
                  onClick={copyWhatsapp}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 text-black text-xs font-bold cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'הועתק ✓' : 'העתק טקסט ל-WhatsApp'}
                </button>
                <a
                  href={wa.waMeLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-200 text-xs font-bold hover:bg-white/10"
                >
                  <MessageCircle className="w-3.5 h-3.5" /> פתח ב-WhatsApp
                </a>
              </div>
              <textarea
                readOnly
                value={wa.text}
                dir="rtl"
                rows={16}
                className="w-full flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-zinc-200 leading-relaxed resize-y min-h-[320px] font-mono"
              />
              {wa.hashtags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {wa.hashtags.map((t) => (
                    <span key={t} className="text-[11px] text-brand-400 font-mono bg-brand-500/10 border border-brand-500/20 rounded px-1.5 py-0.5">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-2">
                <span className="flex items-center gap-1.5 text-zinc-400 text-xs font-mono uppercase tracking-wider">
                  <ImageIcon className="w-3.5 h-3.5" /> נכס ויזואלי ממותג ({cardFormat})
                </span>
                <button
                  onClick={downloadCard}
                  disabled={!cardImg || busy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 text-black text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" /> הורד תמונה ממותגת ל-WhatsApp
                </button>
              </div>
              <div className="flex-1 flex items-center justify-center rounded-lg bg-black/40 border border-white/10 p-3 min-h-[300px]">
                {busy ? (
                  <Loader2 className="w-6 h-6 animate-spin text-zinc-600" />
                ) : cardImg ? (
                  <img
                    src={cardImg}
                    alt="כרטיס ממותג ל-WhatsApp"
                    className="max-h-[440px] w-auto max-w-full rounded-md shadow-lg"
                    style={{ aspectRatio: cardFormat === '1:1' ? '1 / 1' : '9 / 16' }}
                  />
                ) : (
                  <p className="text-xs text-zinc-600">אין תצוגה</p>
                )}
              </div>
              <p className="text-[10px] text-zinc-600 mt-2">
                מותג מלא: לוגו + פס דומיין mrdaniel.co.il, ירוק NVIDIA + פחם + סלייט מתכתי, כותרת עברית מותאמת ובידוד כיווניות.
              </p>
            </div>
          </div>
          <details className="mt-4">
            <summary className="text-[11px] text-zinc-500 cursor-pointer font-mono">whatsappPayload (מבנה ל-WhatsApp Business API עתידי)</summary>
            <pre className="mt-2 text-[10px] text-zinc-500 bg-black/40 border border-white/10 rounded-lg p-3 overflow-x-auto" dir="ltr">
{JSON.stringify(wa.businessApiPayload, null, 2)}
            </pre>
          </details>
        </div>
      )}

      {!hasSource && !importing && (
        <div className="dash-card p-10 text-center text-zinc-500 text-sm">
          הדביקו קישור LinkedIn / כתבה, או טקסט חופשי — ואז בחרו יעד (ריל / קרוסלה / עדכון WhatsApp).
          המערכת תשכתב עם AI ותייצר קרוסלה ממותגת של 4–5 שקופיות או עדכון WhatsApp עם נכס ויזואלי תואם.
        </div>
      )}
    </div>
  );
}
