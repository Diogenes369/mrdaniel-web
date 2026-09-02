/**
 * Session persistence for the News Content Agent's generated carousel/story deck.
 *
 * The deck at the bottom of the workspace is expensive to produce (LLM synthesis + multi-slide
 * canvas render) and MUST survive background events — the 4-minute live-feed poll, a re-render
 * triggered by `isGenerating` toggling, an error-boundary reset, a hot reload. It is only ever
 * cleared when the operator explicitly presses "נקה / צור חדש".
 *
 * Two keys so a quota failure on the big one never drops the small one:
 *   - `nca:active_deck_v1`         → lightweight meta (payload text/structure, post caption,
 *                                    article id, format, active slide index). Always fits.
 *   - `nca:active_deck_images_v1`  → the rendered PNG data-URLs. Best-effort — data-URLs for a
 *                                    5-slide 1080×1920 deck can exceed the ~5 MB sessionStorage
 *                                    quota, in which case we drop this key and the component
 *                                    re-renders the images from the restored payload on mount.
 */
import type { StoryPayload } from './storySlides';
import type { SlideFormat } from './instagramStoryRenderer';

const META_KEY = 'nca:active_deck_v1';
const IMG_KEY = 'nca:active_deck_images_v1';

export interface PersistedDeck {
  payload: StoryPayload;
  /** ready-to-paste caption saved alongside so Quick-Publish still works after a cold restore */
  postText: string;
  articleId: string;
  format: SlideFormat;
  activeIndex: number;
  savedAt: number;
}

function ss(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Sync the lightweight deck meta. Called on every synth / edit / slide-nav / format change. */
export function saveDeckMeta(meta: PersistedDeck): void {
  const store = ss();
  if (!store) return;
  try {
    store.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* quota / private mode — non-fatal, the deck stays in React state */
  }
}

/** Sync the rendered slide images. Best-effort: on quota failure the key is removed so a later
 * restore falls back to re-rendering from the payload rather than reading a half-written blob. */
export function saveDeckImages(articleId: string, format: SlideFormat, images: string[]): void {
  const store = ss();
  if (!store) return;
  try {
    store.setItem(IMG_KEY, JSON.stringify({ articleId, format, images }));
  } catch {
    try {
      store.removeItem(IMG_KEY);
    } catch {
      /* ignore */
    }
  }
}

/** Restore the active deck. Returns null when nothing valid is stored. Images come back only when
 * they were persisted AND still match the stored meta's article + format. */
export function loadDeck(): { meta: PersistedDeck; images: string[] } | null {
  const store = ss();
  if (!store) return null;
  let meta: PersistedDeck;
  try {
    const raw = store.getItem(META_KEY);
    if (!raw) return null;
    meta = JSON.parse(raw) as PersistedDeck;
  } catch {
    return null;
  }
  if (
    !meta ||
    !meta.payload ||
    !Array.isArray(meta.payload.slides) ||
    meta.payload.slides.length === 0
  ) {
    return null;
  }
  if (meta.format !== '9:16' && meta.format !== '4:5' && meta.format !== '1:1') meta.format = '9:16';
  if (typeof meta.activeIndex !== 'number' || meta.activeIndex < 0) meta.activeIndex = 0;

  let images: string[] = [];
  try {
    const rawImgs = store.getItem(IMG_KEY);
    if (rawImgs) {
      const parsed = JSON.parse(rawImgs) as { articleId: string; format: SlideFormat; images: string[] };
      if (
        parsed &&
        parsed.articleId === meta.articleId &&
        parsed.format === meta.format &&
        Array.isArray(parsed.images)
      ) {
        images = parsed.images.filter((s) => typeof s === 'string' && s.startsWith('data:'));
      }
    }
  } catch {
    /* ignore a bad images blob — the payload alone is enough to re-render */
  }
  return { meta, images };
}

/** Wipe the persisted deck. Only ever called from the explicit "נקה / צור חדש" button. */
export function clearDeck(): void {
  const store = ss();
  if (!store) return;
  for (const k of [META_KEY, IMG_KEY]) {
    try {
      store.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}
