/**
 * Helpers for attaching the generated branded preview image to a Quick-Publish flow.
 *
 * Threads' web composer has no file-attach intent param, so the branded card is delivered to the
 * user as a file: the publish flow silently downloads the high-res PNG (default) for manual
 * attachment, while the caption stays on the clipboard and is also pre-filled via `?text=`.
 * `copyImageToClipboard` is offered separately for browsers that support `ClipboardItem` image
 * writes (Chromium, secure context) — note it REPLACES the caption on the clipboard, so it's an
 * explicit opt-in, not part of the auto flow.
 */

export const THREADS_IMAGE_FILENAME = 'mr-daniel-threads-card.png';

/** Trigger a browser download of an image (`data:` URL or any fetchable URL). No dialog for
 *  `data:` URLs on Chromium/Firefox. Returns false when `src` is empty or the click throws. */
export function downloadBrandedImage(src: string | null | undefined, filename = THREADS_IMAGE_FILENAME): boolean {
  if (!src) return false;
  try {
    const a = document.createElement('a');
    a.href = src;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  } catch {
    return false;
  }
}

async function toPngBlob(src: string): Promise<Blob | null> {
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.type === 'image/png') return blob;
    // Re-encode (e.g. a jpeg source) to PNG via canvas so ClipboardItem accepts it.
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
  } catch {
    return null;
  }
}

/**
 * Best-effort: write the image itself to the OS clipboard as PNG. Only works on browsers that
 * expose `ClipboardItem` + `navigator.clipboard.write` in a secure context (Chromium). Returns
 * true only on a successful write. Safe to call unconditionally — never throws.
 */
export async function copyImageToClipboard(src: string | null | undefined): Promise<boolean> {
  if (!src || typeof window === 'undefined') return false;
  const CI = (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
  if (!CI || !navigator.clipboard?.write) return false;
  try {
    const blob = await toPngBlob(src);
    if (!blob) return false;
    await navigator.clipboard.write([new CI({ 'image/png': blob })]);
    return true;
  } catch {
    return false;
  }
}

