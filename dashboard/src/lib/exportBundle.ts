import JSZip from 'jszip';
import type { QueueItem } from './agentTypes';

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] ?? '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const PLATFORM_LABEL: Record<string, string> = { linkedin: 'LinkedIn', instagram: 'Instagram', tiktok: 'TikTok' };

/**
 * WhatsApp's click-to-chat link (wa.me/...) — the only WhatsApp integration this dashboard can use
 * without a registered WhatsApp Business API app — can only pre-fill TEXT, never attach media. That
 * is a real platform limitation, not a gap in this code. This export is the honest alternative:
 * bundles the ready-to-paste caption alongside every generated slide image (full resolution, exactly
 * as the provider returned it — no downscaling anywhere in this pipeline) into one .zip, ready to
 * attach manually to LinkedIn/Instagram/WhatsApp after opening with the text.
 */
export async function exportQueueItemBundle(item: QueueItem & { id: string }, opts: { carouselImages?: (string | undefined)[] } = {}): Promise<void> {
  const zip = new JSZip();
  const isEngagement = item.kind === 'engagement';
  const lines: string[] = [];

  if (isEngagement) {
    lines.push('הודעת פנייה — מוכנה להעתקה', '', item.draftMessage);
  } else {
    const platformName = PLATFORM_LABEL[item.platform] ?? item.platform;
    lines.push(`מוכן להעתקה עבור ${platformName}`, '='.repeat(30), '', item.body);
    if (item.carouselSlides && item.carouselSlides.length > 0) {
      lines.push('', '--- פירוט שקופיות (התמונות המצורפות כבר כוללות את הכותרת והלוגו) ---');
      item.carouselSlides.forEach((slide, i) => lines.push(`שקופית ${i + 1}: ${slide}`));
    }
    if (item.hashtags && item.hashtags.length > 0) {
      lines.push('', `האשטגים: ${item.hashtags.join(' ')}`);
    }
    lines.push('', '--- הערה ---', 'WhatsApp: הדביקו את הטקסט למעלה בהודעה, וצרפו את קבצי התמונה מהחבילה הזו ידנית (WhatsApp אינו תומך בצירוף מדיה אוטומטי דרך קישור).');
  }
  zip.file('caption.txt', lines.join('\n'));

  if (!isEngagement && item.imageGenerationPrompt) {
    zip.file('image-generation-prompt.txt', item.imageGenerationPrompt);
  }

  opts.carouselImages?.forEach((dataUrl, i) => {
    if (dataUrl) zip.file(`slide-${i + 1}.png`, dataUrlToBytes(dataUrl));
  });

  const blob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(blob, `mrdaniel-content-${item.id.slice(0, 8)}.zip`);
}
