import { describeAiError } from './aiErrors';
import { postToAgent } from './threadsImportApi';
import { renumberSteps, type TechTipDeck, type TechTipSlide, type ThreadTheme } from './techTipsApi';

/**
 * Direct carousel image upload → translated, rebranded carousel — content layer for the dashboard's
 * "תרגום ומיתוג קרוסלות (תמונות)" tab.
 *
 * One server round-trip through /api/agent-generate · action:"image-carousel-deck" (no new Vercel
 * Function — the project is at the Hobby 12-function cap): every uploaded frame's printed text is
 * read and translated by Gemini vision in a single call
 * (`src/server/agents/imageTranslatorAgent.ts`), and the response keeps a strict one-slide-per-frame
 * mapping — this tab never re-fetches anything, since the images never left the browser to begin
 * with. Each returned slide gets ITS OWN uploaded frame reattached as `sourceImage` here, client
 * side, straight from the file the operator dropped in.
 *
 * The deck type is deliberately TechTipDeck. For the 'creator' preset the server also returns
 * per-slide `overlayBoxes` (bounding-box text detections), which `imageOverlayRenderer.ts` uses to
 * erase and redraw text directly on the original frame; every other preset keeps rendering through
 * the existing techTipRenderer template pipeline (PNG carousel + ZIP, motionStudioService reel,
 * preview player) unchanged.
 */

export type ImageCarouselVisualPreset = 'creator' | 'cream-skill' | 'cream-workflow' | 'cream-prompt-library' | 'auto-detect';

/** A carousel frame the operator uploaded, downscaled and encoded once on drop. */
export interface CarouselFrame {
  id: string;
  name: string;
  /** Full data: URL — drawn straight onto the export canvas as the slide's own background. */
  dataUrl: string;
  mimeType: string;
  /** Base64 payload only (no `data:` prefix) — what goes over the wire to the vision model. */
  base64: string;
}

const MAX_DIM = 1440;
const JPEG_QUALITY = 0.85;
export const MAX_FRAMES = 20;
export const MIN_FRAMES = 2;

/**
 * Downscales an uploaded image to a manageable size and encodes it once, for both the vision call
 * and the slide's own rendered background. A raw phone-camera screenshot of a carousel can run
 * several megabytes — unnecessary detail for OCR, and it would only slow the render pipeline down.
 * Re-encoded as JPEG regardless of the source format: carousel exports are flat graphics with no
 * transparency to lose, and JPEG is a fraction of the size.
 */
export function readCarouselFrame(file: File): Promise<CarouselFrame> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('קנבס לא זמין בדפדפן הזה');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
        resolve({
          id: `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          dataUrl,
          mimeType: 'image/jpeg',
          base64: dataUrl.replace(/^data:[^;]+;base64,/, ''),
        });
      } catch (e) {
        reject(e as Error);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`תמונה לא תקינה: ${file.name}`));
    };
    img.src = url;
  });
}

/** Reads every dropped file, skipping any that fail to decode as an image rather than failing the
 *  whole batch — one corrupt file in a 12-image drop shouldn't block the other 11. */
export async function readCarouselFrames(files: File[]): Promise<CarouselFrame[]> {
  const picked = Array.from(files).slice(0, MAX_FRAMES);
  const settled = await Promise.allSettled(picked.map(readCarouselFrame));
  return settled.filter((r): r is PromiseFulfilledResult<CarouselFrame> => r.status === 'fulfilled').map((r) => r.value);
}

// ─── local fallback ─────────────────────────────────────────────────────────────────────────

const VISUAL_BASE =
  'abstract dark cyber technology background, deep obsidian, subtle circuit and node grid geometry, neon green and cyan accents, no text, no letters, no words, no logos, no watermark';

function slide(partial: Partial<TechTipSlide> & Pick<TechTipSlide, 'kind'>): TechTipSlide {
  return {
    kicker: 'טיוטה',
    title: '',
    body: '',
    bullets: [],
    code: '',
    codeLang: '',
    stepNumber: 0,
    visualPrompt: VISUAL_BASE,
    ...partial,
  };
}

/**
 * Deterministic placeholder deck, used whenever the server is unreachable or too few frames were
 * uploaded. Unlike the Threads/Instagram text pipelines there is no caption to fall back to — the
 * whole point was reading text OFF the images — so this only guarantees a deck skeleton, one slide
 * per uploaded frame with that frame as its background, that the operator can fill in by hand.
 */
function buildLocalCarouselDeck(frames: CarouselFrame[], reason: string): TechTipDeck {
  const n = Math.max(2, frames.length);
  const theme: ThreadTheme = 'general';
  const slides = Array.from({ length: n }, (_, i) =>
    slide({
      kind: i === 0 ? 'cover' : i === n - 1 ? 'cta' : 'concept',
      title: i === 0 ? 'קרוסלה מיובאת' : i === n - 1 ? 'עכשיו התור שלכם' : `שקופית ${i + 1}`,
      body: 'לא בוצע תרגום אוטומטי לשקופית הזו — ערכו את הטקסט ידנית לפני פרסום.',
      theme,
      badge: 'Tech',
      sourceImage: frames[i]?.dataUrl,
    })
  );
  return {
    title: 'קרוסלה מיובאת',
    slides,
    hashtags: ['#AI', '#אוטומציה', '#עסקים'],
    synthesized: false,
    fallbackReason: reason,
    topic: { theme, badge: 'Tech', guideSlug: '', signals: [] },
    createdAt: Date.now(),
  };
}

// ─── step 1+2 combined · translate & lay out ────────────────────────────────────────────────

export interface ImageCarouselDeckResult {
  deck: TechTipDeck;
  /** The preset actually rendered — meaningful feedback when the operator picked "auto-detect". */
  resolvedPreset: Exclude<ImageCarouselVisualPreset, 'auto-detect'>;
}

/** Translate, rebrand and lay out uploaded carousel frames into a themed Hebrew deck. Never throws. */
export async function synthesizeImageCarouselDeck(
  frames: CarouselFrame[],
  notes?: string,
  visualPreset: ImageCarouselVisualPreset = 'creator'
): Promise<ImageCarouselDeckResult> {
  const offlinePreset = visualPreset === 'auto-detect' ? 'creator' : visualPreset;
  if (frames.length < MIN_FRAMES) {
    return { deck: buildLocalCarouselDeck(frames, `נדרשות לפחות ${MIN_FRAMES} תמונות שקופיות ליצירת קרוסלה`), resolvedPreset: offlinePreset };
  }
  try {
    const res = await postToAgent(
      'image-carousel-deck',
      {
        frames: frames.map((f) => ({ mimeType: f.mimeType, data: f.base64 })),
        notes: notes?.trim() || undefined,
        visualPreset,
      },
      120000
    );
    if (!res.ok) return { deck: buildLocalCarouselDeck(frames, (await describeAiError(res)).message), resolvedPreset: offlinePreset };
    const data = (await res.json()) as {
      ok?: boolean;
      blocked?: boolean;
      synthesized?: boolean;
      fallbackReason?: string;
      topic?: TechTipDeck['topic'];
      resolvedPreset?: string;
      deck?: { title: string; slides: TechTipSlide[]; hashtags: string[] };
    };
    if (data.blocked) return { deck: buildLocalCarouselDeck(frames, 'הפלט נחסם ע"י מסנן התוכן'), resolvedPreset: offlinePreset };
    if (!data.ok || !data.deck || !Array.isArray(data.deck.slides) || data.deck.slides.length < MIN_FRAMES) {
      return { deck: buildLocalCarouselDeck(frames, 'מנוע ה-AI לא החזיר דק שמיש'), resolvedPreset: offlinePreset };
    }
    const slides = renumberSteps(data.deck.slides);
    // Strict 1:1 frame -> slide correspondence, guaranteed server-side: each slide gets its OWN
    // uploaded frame back as its background, drawn straight from the browser — no re-fetch, no
    // img-proxy round trip, since the image never left the client to begin with.
    slides.forEach((s, i) => {
      if (frames[i]) s.sourceImage = frames[i].dataUrl;
    });
    const resolved =
      data.resolvedPreset === 'cream-skill' || data.resolvedPreset === 'cream-workflow' || data.resolvedPreset === 'cream-prompt-library'
        ? data.resolvedPreset
        : 'creator';
    return {
      deck: {
        title: data.deck.title || 'קרוסלה מתורגמת',
        slides,
        hashtags: data.deck.hashtags?.length ? data.deck.hashtags : ['#AI', '#אוטומציה', '#עסקים'],
        // The agent serves its own placeholder deck when the model's output is unusable, and says so
        // here — reporting that as synthesised would hide a real degradation from the operator.
        synthesized: data.synthesized !== false,
        fallbackReason: data.fallbackReason,
        topic: data.topic,
        createdAt: Date.now(),
      },
      resolvedPreset: resolved,
    };
  } catch (e) {
    return { deck: buildLocalCarouselDeck(frames, (e as Error).message || 'שגיאת רשת מול מנוע ה-AI'), resolvedPreset: offlinePreset };
  }
}

/**
 * Ready-to-paste caption for a translated carousel. Carries no source attribution, per the
 * repo-wide rule that the only brand on generated output is mrdaniel.co.il.
 */
export function imageCarouselDeckCaption(deck: TechTipDeck): string {
  const first = deck.slides.find((s) => s.body)?.body ?? '';
  const link = deck.slides.find((s) => s.kind === 'cta')?.ctaUrl ?? '';
  return [
    deck.title,
    '',
    first.slice(0, 220),
    '',
    'החליקו לכל השקפים ➔',
    link ? `המדריך המלא: ${link}` : 'עוד מדריכים ב-mrdaniel.co.il',
    '',
    deck.hashtags.join(' '),
  ]
    .join('\n')
    .trim();
}
