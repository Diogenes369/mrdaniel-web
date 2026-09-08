import { SITE_ORIGIN } from './useDashboardRefresh';
import { applySlideEdits, localSlideEdit, slidesToEditable, type StoryPayload } from './storySlides';
import { getAdminSecret, reportAuthFailure } from './adminSecret';


export interface EditResult {
  payload: StoryPayload;
  via: 'ai' | 'local';
  changed: boolean;
  note?: string;
}

/**
 * Apply a natural-language edit instruction to a carousel deck. Tries the AI editor endpoint
 * (`/api/agent-generate` · action:"slides-edit") first; on 429 / error / offline it falls back to
 * a deterministic local edit (shorten / explicit replace). Slide count, order and kinds are
 * always preserved; the CTA slide is never touched.
 */
export async function editDeck(payload: StoryPayload, instruction: string): Promise<EditResult> {
  const editable = slidesToEditable(payload);

  try {
    const url = `${SITE_ORIGIN.replace(/\/$/, '')}/api/agent-generate`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(getAdminSecret() ? { 'x-admin-secret': getAdminSecret() } : {}),
    };
    const body = JSON.stringify({ action: 'slides-edit', instruction, slides: editable });

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 75000);
    let res: Response;
    try {
      res = await fetch(url, { method: 'POST', headers, body, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 429) throw new Error('מכסת ה-API של Gemini לשעה זו מוצתה (429)');
    if (res.status === 401) {
      reportAuthFailure('agent-generate'); // one shared prompt, not a raw toast per call
      throw new Error('אימות מול /api/agent-generate נכשל (401)');
    }
    if (res.status === 503) throw new Error('GEMINI_API_KEY לא מוגדר באתר (503)');
    if (!res.ok) throw new Error(`שרת ה-AI החזיר שגיאה ${res.status}`);

    const data = (await res.json()) as {
      ok?: boolean;
      blocked?: boolean;
      slides?: { n: number; kind: string; text: string }[];
    };
    if (data.blocked) throw new Error('הפלט נחסם ע"י מסנן התוכן');
    if (!data.ok || !Array.isArray(data.slides) || data.slides.length !== editable.length) {
      throw new Error('העורך לא החזיר מערך שקופיות תואם');
    }

    const merged = editable.map((e) => {
      const hit = data.slides!.find((x) => Number(x.n) === e.n);
      return { n: e.n, kind: e.kind, text: (hit?.text ?? e.text).trim() };
    });
    return { payload: applySlideEdits(payload, merged), via: 'ai', changed: true };
  } catch (err) {
    const local = localSlideEdit(payload, instruction);
    return {
      payload: local.payload,
      via: 'local',
      changed: local.changed,
      note: local.changed
        ? 'בוצע מקומית (ללא AI).'
        : `שכתוב AI לא זמין (${(err as Error).message}). ${local.note ?? ''}`,
    };
  }
}
