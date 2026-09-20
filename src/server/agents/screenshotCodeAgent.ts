import {
  generateContentWithRetry,
  GEMINI_TEXT_MODEL,
  ModelOutputError,
  requireText,
  stripCodeFence,
} from '../../agent/geminiClient.js';
import { sanitizeInput } from '../../agent/AgentSecurityGuard.js';

/**
 * Screenshot / design mock → a clean React + Tailwind component. Driven by
 * /api/agent-generate · action:"screenshot-to-code".
 *
 * ## What was taken from abi/screenshot-to-code, and what was deliberately left behind
 *
 * The upstream project is a FastAPI backend + a websocket streaming frontend + a tool-calling agent
 * loop (create_file / edit_file / screenshot_preview / extract_assets / generate_images /
 * remove_backgrounds). None of that is run here — it would be a second service to deploy, and this
 * project is already at the Vercel Hobby 12-function ceiling, which is why every AI action in the
 * dashboard is a branch of /api/agent-generate rather than its own endpoint.
 *
 * What actually carries the quality in that project is the *prompt*, not the runtime, so the prompt
 * is what was ported (upstream `backend/prompts/system_prompt.py`, `backend/prompts/create/image.py`
 * and `backend/prompts/policies.py`). Specifically kept:
 *   - the "looks exactly like the screenshot" framing plus the explicit replication block;
 *   - "use the EXACT text from the screenshot" — the biggest single quality lever, and the first
 *     thing a vision model silently drops;
 *   - the multi-screenshot organisation rules (distinct pages → navigation, tabs → one component
 *     with internal state, unrelated → labelled sections);
 *   - "for mobile screenshots, do not include the device frame or browser chrome";
 *   - the image policy from upstream's `build_user_image_policy(image_generation_enabled=False)`:
 *     no asset generation, https://placehold.co placeholders. This repo does have an image
 *     generator (OpenHiggsfield), but it is PAUSED behind a default-off flag and is billable — a
 *     code-from-screenshot call must never quietly start spending on it.
 *
 * Deliberately changed: upstream emits ONE standalone `index.html` that pulls React, Babel and
 * Tailwind from CDNs, because its output has to run inside a sandboxed `srcdoc` preview. That is
 * the wrong artifact here — the dashboard operator wants a file they can drop into a Vite + React
 * 19 + Tailwind 4 codebase. So the output contract is a single self-contained component module:
 * one default export, Tailwind utility classes only, no CDN script tags, no build config.
 *
 * ## Why this does not live in SocialAgentEngine.ts
 *
 * Two reasons, both load-bearing:
 *   1. The engine's prompt corpus is Hebrew marketing voice (EXPERT_VOICE_RULES / AUDIENCE_RULES).
 *      None of it applies to source code, and importing the engine would pull all of it into this
 *      bundle for nothing — the same reason geminiClient.ts was split out in the first place.
 *   2. Every engine call goes through the shared response scrubber. See `scrub: false` below.
 */

/** The two module flavours an operator can ask for. Both are React + Tailwind; only the typing
 *  differs, and the dashboard names the downloaded file accordingly (.tsx / .jsx). */
export const SCREENSHOT_VARIANTS = ['tsx', 'jsx'] as const;
export type ScreenshotVariant = (typeof SCREENSHOT_VARIANTS)[number];

/** Upstream sends every screenshot at `detail: "high"`. More than a handful of full-page shots is
 *  both a token bill and a quality loss (the model starts averaging layouts), so the batch is
 *  capped. The dashboard enforces the same number and the endpoint re-checks it. */
export const MAX_SCREENSHOTS = 4;

/** Per-image ceiling on the decoded payload. The dashboard already downscales every shot to a
 *  1600px longest edge, which lands well under this; the cap exists so a caller bypassing the
 *  dashboard cannot push a 20MB original through a 120s function. */
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export interface ScreenshotImage {
  mimeType: string;
  /** base64 payload only — no `data:` prefix. */
  data: string;
}

export interface ScreenshotCodeRequest {
  images: ScreenshotImage[];
  /** Free-text operator notes ("make the sidebar collapsible", "RTL", "use our brand green"). */
  instructions?: string;
  /** Preferred component name. Sanitised to a PascalCase identifier; the model cannot override it. */
  componentName?: string;
  variant?: ScreenshotVariant;
}

export interface ScreenshotCodeResult {
  componentName: string;
  variant: ScreenshotVariant;
  /** The component module, ready to paste into a file. */
  code: string;
  /** One or two sentences on what was built — upstream's end-of-task summary, kept. */
  summary: string;
  /** Placeholder / external asset URLs the model used, so the operator knows what still has to be
   *  swapped for a real asset. */
  placeholders: string[];
  model: string;
  /** True when the model answered with bare code instead of the requested JSON envelope and the
   *  parser recovered it. Surfaced rather than absorbed, so a systematic regression is visible. */
  recovered: boolean;
}

// ─── prompt ────────────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert front-end engineer who converts screenshots and design mocks into production-grade React components.

# Output contract

Return ONE JSON object and nothing else:

{
  "componentName": "PascalCaseName",
  "code": "the complete component module as a single string",
  "summary": "one or two sentences describing what you built",
  "placeholders": ["every placeholder or external asset URL you used"]
}

# Rules for "code"

- A single, self-contained module with exactly one \`export default\` — the component. Helper
  components and constants may live in the same file, above it.
- Styling is Tailwind CSS utility classes ONLY. No \`<style>\` tags, no CSS files, and no
  \`style={{...}}\` except for a value Tailwind genuinely cannot express (an exact background image
  URL, a computed transform).
- Do not emit \`<script>\` or \`<link>\` tags, CDN URLs, a Tailwind config, an HTML document shell, or
  any build configuration. The component is dropped into an existing Vite + React 19 + Tailwind 4
  project that already has all of that.
- Imports are limited to \`react\` and \`lucide-react\` (icons). Never import any other package.
- The component takes no required props and renders standalone.
- Anything that visibly has state in the screenshot (tabs, toggles, accordions, dropdowns,
  carousels) gets real local state with \`useState\` and actually works.
- Semantic HTML: real \`<button>\` / \`<a>\` / \`<input>\` elements, \`alt\` text on every image, and every
  label tied to its input.
- Responsive: the screenshot is one breakpoint, not the whole design. Use Tailwind's responsive
  prefixes so the layout holds on a phone.
- If the screenshot's interface is in a right-to-left language (Hebrew, Arabic), set \`dir="rtl"\` on
  the root element and use logical spacing utilities (ms-/me-/ps-/pe-) instead of left/right ones.

# JSON encoding

"code" is a JSON string, so every newline inside it is \\n and every double quote is \\". Emit valid
JSON — do not wrap the object in a markdown fence, and add no commentary before or after it.`;

const REPLICATION_INSTRUCTIONS = `Generate a React component that looks exactly like the provided screenshot(s).

## Replication instructions

- Make sure the component looks exactly like the screenshot: same layout, same spacing, same
  proportions, same colors, same border radii, same shadows, same font weights and sizes.
- Use the EXACT text from the screenshot. Do not paraphrase it, do not translate it, do not replace
  it with lorem ipsum, and do not shorten it. Read every label, heading, caption, number and button
  string off the image and reproduce it character for character.
- Match the palette by reading it off the image, not by guessing at a theme. Prefer an exact
  Tailwind arbitrary value (\`bg-[#0b0f17]\`) over an approximate named shade when the screenshot's
  color does not land on one.
- Icons: use \`lucide-react\` for anything that is clearly a standard icon (chevron, search, bell,
  user, menu, close, arrow, social glyph). Pick the closest match by shape.
- Images and logos: image generation is disabled for this request. Do not embed or recreate the
  screenshot itself as an image, and never inline a base64 asset. Use https://placehold.co
  placeholder URLs sized to the slot (for example https://placehold.co/400x300), give each one
  descriptive \`alt\` text, and list every URL you used in "placeholders". A logo that is plain text
  should be rendered as styled text, not as an image.
- Charts and data visualisations: rebuild them with divs and Tailwind, or with inline SVG. Do not
  import a charting library.
- Do not include the device frame, the browser chrome, the OS status bar, the mouse cursor, or any
  annotation drawn over the mock. Reproduce only the interface itself.

## Multiple screenshots

If several screenshots are provided, organise them meaningfully:
- Different pages of the same site → one component with internal view state and working navigation
  between the views.
- Different tabs or states of one screen → one component whose tabs/states actually switch.
- Clearly unrelated screens → one component that stacks them as labelled sections
  ("Screenshot 1", "Screenshot 2", ...) so each is easy to find.`;

/** A PascalCase identifier, or the fallback. Guards both the file name and the `export default`
 *  name — the operator's free text and the model's own answer both reach this, and neither is
 *  trustworthy as an identifier. */
export function normalizeComponentName(raw: unknown, fallback = 'ScreenshotComponent'): string {
  const cleaned = String(raw ?? '')
    .replace(/[^A-Za-z0-9 _-]/g, ' ')
    // A component name must start with a capital LETTER, or React reads the JSX tag as an HTML
    // element. Leading non-letters are dropped here rather than after the join, because doing it
    // afterwards decapitalises the result: "2fa-form" would pascal-case to "2faForm" and then lose
    // only the digit, leaving the invalid "faForm".
    .replace(/^[^A-Za-z]+/, '')
    .trim();
  if (!cleaned) return fallback;
  const pascal = cleaned
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
  return pascal ? pascal.slice(0, 60) : fallback;
}

/** Validates one uploaded image before it costs a model call. Returns the reason rather than a
 *  bare false, so the endpoint can tell the operator which frame was rejected and why. */
export function validateScreenshotImage(raw: unknown): { ok: true; image: ScreenshotImage } | { ok: false; reason: string } {
  const rec = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  // A dashboard paste can arrive as a full data: URL; accept it rather than failing on the prefix.
  const data = String(rec.data ?? '')
    .replace(/^data:[^;]+;base64,/, '')
    .trim();
  const mimeType = String(rec.mimeType ?? '').trim().toLowerCase() || 'image/png';
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(mimeType)) {
    return { ok: false, reason: `unsupported image type "${mimeType}" — expected png, jpeg or webp` };
  }
  if (!data) return { ok: false, reason: 'empty image payload' };
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return { ok: false, reason: 'image payload is not valid base64' };
  // 4 base64 chars encode 3 bytes; padding takes one byte off per '='.
  const bytes = Math.floor((data.length * 3) / 4) - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
  if (bytes > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      reason: `image is ${Math.round(bytes / 1024 / 1024)}MB — the ceiling is ${MAX_IMAGE_BYTES / 1024 / 1024}MB per screenshot`,
    };
  }
  return { ok: true, image: { mimeType, data } };
}

// ─── response parsing ──────────────────────────────────────────────────────────────────────────

/** Strips a markdown fence from around code. `stripCodeFence` in geminiClient only knows the bare
 *  and ```json forms; a code answer comes back fenced as ```tsx / ```jsx / ```javascript. */
function stripFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```[a-z]*\s*\n([\s\S]*?)\n?```$/i);
  return match ? match[1] : trimmed;
}

/** The identifier the module actually exports, when it is a named declaration. Preferred over the
 *  model's self-reported `componentName`, because the two disagreeing yields a file whose name does
 *  not match its own export. */
function exportedNameFrom(code: string): string | null {
  return (
    code.match(/export\s+default\s+function\s+([A-Za-z_$][\w$]*)/)?.[1] ??
    code.match(/export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$/m)?.[1] ??
    null
  );
}

/** Pulls the component module out of whatever the model actually returned.
 *
 *  The happy path is the JSON envelope the system prompt asks for. The fallback matters: a vision
 *  model handed a screenshot full of quotes and braces occasionally answers with a bare fenced code
 *  block instead, and discarding that would turn a perfectly good component into an error. A failed
 *  parse therefore falls back to treating the whole answer as code, and says so via `recovered`. */
export function parseScreenshotCodeResponse(
  raw: string,
  requestedName: string,
  variant: ScreenshotVariant
): ScreenshotCodeResult {
  const text = raw.trim();
  let envelope: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(stripCodeFence(text)) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) envelope = parsed as Record<string, unknown>;
  } catch {
    /* fall through to the bare-code recovery below */
  }

  const recovered = envelope === null;
  const code = stripFence(String(envelope?.code ?? (recovered ? text : ''))).trim();

  if (!code) throw new ModelOutputError('screenshot-to-code: the model returned no component code');
  if (!/export\s+default/.test(code)) {
    throw new ModelOutputError('screenshot-to-code: the generated module has no `export default` component');
  }

  const placeholders = Array.isArray(envelope?.placeholders)
    ? (envelope.placeholders as unknown[])
        .map((u) => String(u).trim())
        .filter((u) => /^https?:\/\//.test(u))
        .slice(0, 40)
    : [...new Set(code.match(/https?:\/\/[^\s"'`)]+/g) ?? [])].slice(0, 40);

  return {
    // The exported identifier wins over the model's self-reported `componentName`: the two
    // disagreeing would hand the operator a file whose name does not match the symbol inside it.
    componentName: normalizeComponentName(exportedNameFrom(code) ?? envelope?.componentName ?? requestedName, requestedName),
    variant,
    code,
    summary: String(envelope?.summary ?? '').trim().slice(0, 600),
    placeholders,
    model: GEMINI_TEXT_MODEL,
    recovered,
  };
}

// ─── the call ──────────────────────────────────────────────────────────────────────────────────

/** Builds the user turn. Exported for the test, which asserts the ported upstream rules are all
 *  present without spending a model call. */
export function buildScreenshotPrompt(input: {
  count: number;
  variant: ScreenshotVariant;
  componentName: string;
  instructions?: string;
}): string {
  const typing =
    input.variant === 'tsx'
      ? 'Write TypeScript (.tsx). Type every prop and piece of state explicitly; never use `any`.'
      : 'Write plain JavaScript JSX (.jsx). No TypeScript syntax at all — no type annotations, no interfaces, no `as` casts.';

  const blocks = [
    REPLICATION_INSTRUCTIONS,
    `## This request

- Screenshots provided: ${input.count}.
- Target stack: React 19 function component + Tailwind CSS 4.
- ${typing}
- Name the component \`${input.componentName}\` and export it as the module's default.`,
  ];

  if (input.instructions?.trim()) {
    // Operator notes are free text that ends up next to the system prompt, so they go through the
    // same injection guard every other operator-supplied field in this codebase does.
    const { clean } = sanitizeInput(input.instructions.trim().slice(0, 1500));
    blocks.push(`## Additional instructions from the operator\n\n${clean}`);
  }

  return blocks.join('\n\n');
}

/**
 * One vision call: screenshots in, a React + Tailwind component out.
 *
 * `scrub: false` is not optional here. The shared response scrubber ends with
 * `replace(/[ \t]{2,}/g, ' ')`, which is a no-op on English but fires for the *whole* answer as soon
 * as it contains a single Hebrew character — and a screenshot of a Hebrew interface produces a
 * component full of Hebrew string literals. With the scrubber on, that answer comes back with every
 * level of indentation collapsed to one space.
 */
export async function generateComponentFromScreenshot(input: ScreenshotCodeRequest): Promise<ScreenshotCodeResult> {
  if (!input.images?.length) throw new Error('no screenshots to read');

  const variant: ScreenshotVariant = SCREENSHOT_VARIANTS.includes(input.variant as ScreenshotVariant)
    ? (input.variant as ScreenshotVariant)
    : 'tsx';
  const componentName = normalizeComponentName(input.componentName);
  const images = input.images.slice(0, MAX_SCREENSHOTS);

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  images.forEach((img, i) => {
    if (images.length > 1) parts.push({ text: `[Screenshot ${i + 1} of ${images.length}]` });
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
  });
  parts.push({
    text: buildScreenshotPrompt({ count: images.length, variant, componentName, instructions: input.instructions }),
  });

  const response = await generateContentWithRetry(
    {
      model: GEMINI_TEXT_MODEL,
      contents: [{ role: 'user', parts }],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        // Replication, not invention: the task is to copy a design precisely, so sampling is much
        // tighter than the content generators in this repo, which want variety.
        temperature: 0.2,
        topP: 0.85,
        responseMimeType: 'application/json',
        maxOutputTokens: 32000,
      },
    },
    { scrub: false }
  );

  return parseScreenshotCodeResponse(requireText(response), componentName, variant);
}
