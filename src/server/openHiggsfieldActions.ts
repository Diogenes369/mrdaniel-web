import {
  checkHiggsfieldRun,
  describeHiggsfieldModel,
  describeMissingHiggsfieldKeys,
  generateHiggsfieldMedia,
  higgsfieldConfigured,
  listHiggsfieldModels,
  printMissingHiggsfieldKeysMessage,
  startHiggsfieldRun,
  type HiggsfieldBrief,
  type MediaRole,
  type Surface,
} from '../agent/OpenHiggsfieldEngine.js';

/**
 * The `higgsfield-*` actions of /api/agent-generate — image and video generation over the
 * OpenHiggsfield catalog (38 models). See docs/openhiggsfield-bridge.md.
 *
 * This lives in src/server/ rather than in its own api/ file because of the 12-function cap
 * (PROJECT_STATE §1.4): `api/` is full, so a new endpoint has to fold into agent-generate as
 * actions, exactly like the news auto-publisher did. Both the Vercel handler and server.ts's
 * local-dev mirror call in here, so dev and production share one implementation.
 *
 * Four actions:
 *   higgsfield-models    the catalog, filterable by surface/search, + whether the keys are set
 *   higgsfield-model     one model's settings allow-list and input roles
 *   higgsfield-generate  queue a run; returns the requestId, or waits when asked to
 *   higgsfield-status    poll one requestId
 *
 * Every caller is already past agent-generate's admin gate, so nothing re-checks it here. What this
 * module does enforce is the platform keys: with none configured it answers 503 and names the
 * missing env rather than attempting a run.
 *
 * PAUSED since 2026-09-20 by explicit request — see HIGGSFIELD_ENABLED below.
 */

export const HIGGSFIELD_ACTIONS = [
  'higgsfield-models',
  'higgsfield-model',
  'higgsfield-generate',
  'higgsfield-status',
] as const;

export type HiggsfieldAction = (typeof HIGGSFIELD_ACTIONS)[number];

export function isHiggsfieldAction(action: unknown): action is HiggsfieldAction {
  return typeof action === 'string' && (HIGGSFIELD_ACTIONS as readonly string[]).includes(action);
}

/**
 * The billable half of this bridge is OFF by default.
 *
 * Paused 2026-09-20 by explicit request: the platform origin is still unresolved (see
 * docs/openhiggsfield-bridge.md) and no paid media generation should be reachable while it is. The
 * carousel pipeline never called this bridge in the first place — News/Thread/Comparison decks are
 * Gemini text plus our own layout code, and scripts/__tests__/openhiggsfield-bridge.test.mjs asserts
 * that — so this flag exists to stop a *deliberate* call from the dashboard or Hermes, not to
 * correct a default.
 *
 * Re-arm without a deploy by setting HIGGSFIELD_ENABLED=1 (or true/on) on the project. The catalog
 * reads stay available either way: they are local data and cost nothing.
 */
const HIGGSFIELD_ENABLED = /^(?:1|true|on)$/i.test((process.env.HIGGSFIELD_ENABLED ?? '').trim());

const MEDIA_ROLES: MediaRole[] = ['start', 'end', 'reference', 'video', 'audio'];
/** agent-generate's own ceiling is 120s (vercel.json), so a blocking run gets 90s and hands the
 * requestId back if the platform is slower. Video belongs on the poll path, not this one. */
const MAX_WAIT_MS = 90_000;

export interface HiggsfieldActionResult {
  status: number;
  payload: Record<string, unknown>;
}

export async function handleHiggsfieldAction(
  action: HiggsfieldAction,
  body: unknown
): Promise<HiggsfieldActionResult> {
  const source = asRecord(body);

  if (action === 'higgsfield-models') {
    const models = listHiggsfieldModels({ surface: asSurface(source.surface), search: str(source.search) });
    return {
      status: 200,
      payload: {
        ok: true,
        configured: higgsfieldConfigured(),
        missingKeys: describeMissingHiggsfieldKeys(),
        counts: {
          total: models.length,
          image: models.filter((model) => model.surface === 'image').length,
          video: models.filter((model) => model.surface === 'video').length,
        },
        models,
      },
    };
  }

  if (action === 'higgsfield-model') {
    const id = str(source.model);
    if (!id) return bad("'model' is required");
    try {
      return { status: 200, payload: { ok: true, model: describeHiggsfieldModel(id) } };
    } catch (err) {
      return bad(message(err));
    }
  }

  if (action === 'higgsfield-generate' && !HIGGSFIELD_ENABLED) {
    console.warn('[openhiggsfield] generation is paused (HIGGSFIELD_ENABLED is not set) — nothing was submitted');
    return {
      status: 503,
      payload: {
        ok: false,
        code: 'paused',
        error: 'OpenHiggsfield generation is paused — nothing was submitted, and nothing was billed',
        message: 'יצירת המדיה החיצונית מושהית כרגע. הקרוסלות נבנות מ-Gemini והלוגיקה הפנימית בלבד.',
        hint: 'Set HIGGSFIELD_ENABLED=1 on the project to re-arm. See docs/openhiggsfield-bridge.md.',
      },
    };
  }

  const unconfigured = requireKeys();
  if (unconfigured) return unconfigured;

  if (action === 'higgsfield-status') {
    const requestId = str(source.requestId);
    if (!requestId) return bad("'requestId' is required");
    try {
      const run = await checkHiggsfieldRun(requestId, {
        model: str(source.model) || undefined,
        surface: asSurface(source.surface),
      });
      return { status: 200, payload: { ok: run.status !== 'error', run } };
    } catch (err) {
      return fromError(err);
    }
  }

  // higgsfield-generate
  let brief: HiggsfieldBrief;
  try {
    brief = readBrief(source);
  } catch (err) {
    return bad(message(err));
  }

  const wait = source.wait === true || source.wait === 'true';
  try {
    if (!wait) {
      const run = await startHiggsfieldRun(brief);
      return { status: 202, payload: { ok: true, run } };
    }
    const timeoutMs = Math.min(MAX_WAIT_MS, Math.max(5000, Number(source.timeoutMs) || MAX_WAIT_MS));
    const run = await generateHiggsfieldMedia(brief, { timeoutMs });
    const pending = run.status === 'queued' || run.status === 'processing';
    return {
      // Still running at the deadline is not a failure: the requestId stays pollable.
      status: run.status === 'error' ? 502 : 200,
      payload: {
        ok: run.status !== 'error',
        run,
        ...(pending ? { note: 'still running at the wait deadline — poll it with higgsfield-status' } : {}),
      },
    };
  } catch (err) {
    return fromError(err);
  }
}

function requireKeys(): HiggsfieldActionResult | null {
  if (higgsfieldConfigured()) return null;
  printMissingHiggsfieldKeysMessage();
  return {
    status: 503,
    payload: {
      ok: false,
      code: 'not_configured',
      error: 'OpenHiggsfield is not configured — nothing was attempted',
      message: 'מנוע יצירת המדיה (OpenHiggsfield) לא מוגדר בסביבת הריצה של האתר.',
      missingKeys: describeMissingHiggsfieldKeys(),
    },
  };
}

/** Media arrives as `{ start: 'https://…' }` or `{ reference: ['https://…', …] }` — a single URL is
 * the common case from a queue card, so both are accepted and normalized to the array the engine
 * validates against the model's own per-role caps. */
function readMedia(raw: unknown): HiggsfieldBrief['media'] | undefined {
  const source = asRecord(raw);
  const media: NonNullable<HiggsfieldBrief['media']> = {};
  const unknownRoles = Object.keys(source).filter((key) => !MEDIA_ROLES.includes(key as MediaRole));
  if (unknownRoles.length > 0) {
    throw new Error(`unknown media role(s): ${unknownRoles.join(', ')} — expected ${MEDIA_ROLES.join(' | ')}`);
  }
  for (const role of MEDIA_ROLES) {
    const value = source[role];
    if (value === undefined || value === null) continue;
    const list = (Array.isArray(value) ? value : [value]).map(str).filter(Boolean);
    if (list.length > 0) media[role] = list;
  }
  return Object.keys(media).length > 0 ? media : undefined;
}

function readBrief(source: Record<string, unknown>): HiggsfieldBrief {
  const model = str(source.model);
  if (!model) throw new Error("'model' is required — call higgsfield-models for the catalog");
  const prompt = str(source.prompt);
  if (!prompt) throw new Error("'prompt' is required");
  return { model, prompt, media: readMedia(source.media), settings: asRecord(source.settings) };
}

/** A PlatformError carries the platform's own HTTP status; keep it, so a 401 (bad key) reads
 * differently from a 422 (a body the model rejected). Everything else is a bad request. */
function fromError(err: unknown): HiggsfieldActionResult {
  const status = (err as { status?: unknown })?.status;
  const platform = (err as { body?: unknown })?.body;
  const usable = typeof status === 'number' && status >= 400 && status <= 599 ? status : 400;
  console.error('[openhiggsfield] request failed', { status: usable, error: message(err) });
  return {
    status: usable,
    payload: { ok: false, error: message(err), ...(platform !== undefined ? { platform } : {}) },
  };
}

function bad(error: string): HiggsfieldActionResult {
  return { status: 400, payload: { ok: false, error } };
}

function message(err: unknown): string {
  return String((err as { message?: unknown })?.message ?? err);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asSurface(value: unknown): Surface | undefined {
  return value === 'image' || value === 'video' ? value : undefined;
}
