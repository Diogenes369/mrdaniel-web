import { describeAiError, type AiError } from './aiErrors';
import { postToAgent } from './threadsImportApi';

/**
 * Screenshot / design mock → React + Tailwind component — content layer for the dashboard's
 * "מסך לקוד" tab.
 *
 * One server round-trip through /api/agent-generate · action:"screenshot-to-code" (no new Vercel
 * Function — the project is at the Hobby 12-function cap). The vision prompt is ported from
 * abi/screenshot-to-code and lives in `src/server/agents/screenshotCodeAgent.ts`, which documents
 * what was kept from upstream and what was replaced.
 *
 * Unlike the carousel/thread libs next to this one, this module has NO local fallback deck and does
 * not swallow failures. Those pipelines fall back because a half-usable Hebrew deck still beats a
 * blank studio; there is no meaningful "placeholder React component" for a design the operator is
 * trying to reproduce, so a failure is reported with its real reason and the operator retries.
 */

export type ScreenshotVariant = 'tsx' | 'jsx';

/** Mirrors MAX_SCREENSHOTS in the server agent, so the client refuses the same batch the endpoint
 *  would reject — one fewer wasted round-trip. */
export const MAX_SCREENSHOTS = 4;

/** One screenshot the operator dropped, pasted or picked — encoded once on arrival. */
export interface Screenshot {
  id: string;
  name: string;
  /** Full data: URL, for the thumbnail strip. */
  dataUrl: string;
  mimeType: string;
  /** Base64 payload only (no `data:` prefix) — what goes over the wire to the vision model. */
  base64: string;
  /** Encoded byte size, shown in the UI so an operator can see why a shot was downscaled. */
  bytes: number;
}

export interface ScreenshotCodeResult {
  componentName: string;
  variant: ScreenshotVariant;
  code: string;
  summary: string;
  placeholders: string[];
  model: string;
  /** The model answered with bare code rather than the JSON envelope, and the server recovered it.
   *  Shown as a soft notice — the output is fine, but the summary/placeholder list will be thin. */
  recovered: boolean;
}

/**
 * Longest edge of an encoded screenshot.
 *
 * Deliberately larger than the 1440 the carousel importer uses. That pipeline only needs the gist
 * of a slide's text; this one is asked to reproduce every label "character for character", and small
 * UI chrome (12px nav labels, table headers) is the first thing to become unreadable when a 2560px
 * desktop capture is scaled down.
 */
const MAX_DIM = 1600;

/**
 * Screenshots are re-encoded as PNG first, not JPEG.
 *
 * The carousel importer re-encodes to JPEG because its frames are flat graphics and size dominates.
 * A UI screenshot is the opposite case: it is mostly small, high-contrast text on flat fills, which
 * is exactly what JPEG's chroma subsampling smears — and a smeared label is a mis-transcribed label
 * in the generated component. PNG is lossless on that content and often *smaller* for flat UI. The
 * JPEG path below is only the escape hatch for a photo-heavy mock, where PNG genuinely explodes.
 */
const PNG_BUDGET_BYTES = 2 * 1024 * 1024;
const JPEG_QUALITY = 0.92;

const base64Bytes = (b64: string) =>
  Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);

/** Decodes, downscales and encodes one screenshot. Rejects anything that is not a decodable image
 *  so one bad file in a multi-file drop is reported rather than silently sent as an empty frame. */
export function readScreenshot(file: File): Promise<Screenshot> {
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

        let dataUrl = canvas.toDataURL('image/png');
        let mimeType = 'image/png';
        let base64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
        if (base64Bytes(base64) > PNG_BUDGET_BYTES) {
          dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
          mimeType = 'image/jpeg';
          base64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
        }

        resolve({
          id: `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name || 'screenshot.png',
          dataUrl,
          mimeType,
          base64,
          bytes: base64Bytes(base64),
        });
      } catch (e) {
        reject(e as Error);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`תמונה לא תקינה: ${file.name || 'ללא שם'}`));
    };
    img.src = url;
  });
}

/** Reads a drop / picker / paste batch, skipping files that fail to decode rather than failing the
 *  whole batch. `limit` is what is left of the MAX_SCREENSHOTS budget. */
export async function readScreenshots(files: ArrayLike<File>, limit = MAX_SCREENSHOTS): Promise<Screenshot[]> {
  const picked = Array.from(files)
    .filter((f) => f.type.startsWith('image/'))
    .slice(0, Math.max(0, limit));
  const settled = await Promise.allSettled(picked.map(readScreenshot));
  return settled.filter((r): r is PromiseFulfilledResult<Screenshot> => r.status === 'fulfilled').map((r) => r.value);
}

/** Images sitting on a ClipboardEvent — the "paste a screenshot" path, which is how most operators
 *  will actually use this tab (Win+Shift+S, then Ctrl+V). */
export function screenshotFilesFromClipboard(e: ClipboardEvent): File[] {
  const items = Array.from(e.clipboardData?.items ?? []);
  return items
    .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
    .map((it) => it.getAsFile())
    .filter((f): f is File => f !== null);
}

// ─── generation ────────────────────────────────────────────────────────────────────────────────

export type ScreenshotCodeResponse =
  | { ok: true; result: ScreenshotCodeResult }
  | { ok: false; error: string; retryable: boolean };

/** Screenshots → component. Never throws; a failure comes back as `{ ok: false }` with the Hebrew
 *  reason describeAiError() derived from the server's `code`/`message`. */
export async function generateComponentFromScreenshots(input: {
  screenshots: Screenshot[];
  instructions?: string;
  componentName?: string;
  variant: ScreenshotVariant;
}): Promise<ScreenshotCodeResponse> {
  if (!input.screenshots.length) {
    return { ok: false, error: 'לא צורף צילום מסך.', retryable: false };
  }
  try {
    const res = await postToAgent(
      'screenshot-to-code',
      {
        images: input.screenshots.slice(0, MAX_SCREENSHOTS).map((s) => ({ mimeType: s.mimeType, data: s.base64 })),
        instructions: input.instructions?.trim() || undefined,
        componentName: input.componentName?.trim() || undefined,
        variant: input.variant,
      },
      // Generating a full component from several screenshots is the longest model call in the
      // dashboard. The function's own ceiling is 120s (vercel.json), so the client waits slightly
      // past it — aborting first would report a network error for what is really a server timeout.
      130000
    );
    if (!res.ok) {
      const described: AiError = await describeAiError(res);
      return { ok: false, error: described.message, retryable: described.retryable };
    }
    const data = (await res.json()) as Partial<ScreenshotCodeResult> & { ok?: boolean };
    if (!data.ok || !data.code) {
      return { ok: false, error: 'מנוע ה-AI לא החזיר קוד שמיש. נסו שוב, או צמצמו למסך אחד.', retryable: true };
    }
    return {
      ok: true,
      result: {
        componentName: data.componentName || 'ScreenshotComponent',
        variant: data.variant === 'jsx' ? 'jsx' : 'tsx',
        code: data.code,
        summary: data.summary ?? '',
        placeholders: Array.isArray(data.placeholders) ? data.placeholders : [],
        model: data.model ?? '',
        recovered: data.recovered === true,
      },
    };
  } catch (e) {
    const message = (e as Error)?.name === 'AbortError' ? 'הבקשה נקטעה בגלל timeout — נסו עם פחות צילומי מסך.' : (e as Error).message;
    return { ok: false, error: message || 'שגיאת רשת מול מנוע ה-AI', retryable: true };
  }
}

/** `<ComponentName>.tsx` — the name the operator will save the file under anyway. */
export function componentFileName(result: ScreenshotCodeResult): string {
  return `${result.componentName}.${result.variant}`;
}

/** The import line to paste at the call site, assuming the file lands next to its sibling
 *  components. Saved separately from the code because it is the one thing the operator always has
 *  to type by hand after pasting. */
export function componentImportLine(result: ScreenshotCodeResult): string {
  return `import ${result.componentName} from './${result.componentName}';`;
}
