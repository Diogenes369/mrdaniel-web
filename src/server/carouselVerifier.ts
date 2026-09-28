import { detectSlop, dropCeremonySentences, repairContrastHeadline, type SlopHit } from '../agent/antiSlop.js';
import { itemKey } from '../agent/listExtract.js';
import {
  factCheckCarouselClaims,
  synthesizeMissingListEntries,
  type CarouselSlideDesign,
  type CarouselStudioResult,
  type CarouselStudioSlide,
} from '../agent/SocialAgentEngine.js';

/**
 * The content & design verification agent — runs on every Carousel Studio deck BEFORE it is sent
 * to the dashboard to be rendered.
 *
 * The model is told all of this in the prompt; this pass exists because prompting alone never fully
 * holds (the same lesson as stripSlideCta and scrubAiPhrases). It checks four things and fixes what
 * can be fixed without changing meaning:
 *
 *   1. Readability — text that will not fit its layout at a legible size, empty slides, prose that
 *      is not Hebrew. Reported; the renderer's auto-fit handles mild overflow, not a 120-word body.
 *   2. Layout variance — the same layout four times running, too few layout kinds, the same text
 *      zone three slides in a row or the same contrast tone twice in a row. FIXED: design is
 *      re-assigned from a seed derived from the article's title, so the fix differs per article.
 *   3. Context alignment — every source list item covered (FIXED with one small repair call for the
 *      missing ones), and every number on a slide present in the source (reported: a number the
 *      article never stated is a fabricated fact, and deleting it would leave a broken sentence).
 *   3c. Fact-check — a model reads every claim beside the source and rewrites anything unsupported,
 *      inverted, misattributed or strengthened; rewritten claims get one confirmation pass. This is
 *      the only check that sees MEANING — the others see words and numbers.
 *   4. Anti-slop — antiSlop.ts patterns. Ceremony sentences (signposts, sign-offs, generic
 *      optimism) are REMOVED when the slide keeps other content; the rest are reported.
 *
 * Never throws: a failed repair call leaves the deck as it was and says so in the report.
 */

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface VerificationCheck {
  id: 'readability' | 'layout-variance' | 'coverage' | 'numbers' | 'anti-slop' | 'fact-check';
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface CarouselVerification {
  passed: boolean;
  /** 0–100, weighted: a fail costs 25, a warn 8. For the dashboard badge, not a gate. */
  score: number;
  checks: VerificationCheck[];
  /** Human-readable list of what the verifier changed. */
  fixes: string[];
  coverage: { expected: number; covered: number; missing: { n: number; name: string }[]; promised: number | null } | null;
}

const IG_MAX_SLIDES = 20;

// ─── helpers ────────────────────────────────────────────────────────────────────────────────

const words = (t: string) => String(t ?? '').trim().split(/\s+/).filter(Boolean).length;

function slideTexts(s: CarouselStudioSlide): { field: string; text: string; heading?: boolean }[] {
  return [
    { field: 'headline', text: s.headline, heading: true },
    { field: 'subhead', text: s.subhead },
    { field: 'body', text: s.body },
    { field: 'quote', text: s.quote },
    ...s.bullets.map((b) => ({ field: 'bullet', text: b })),
    ...s.bulletsLeft.map((b) => ({ field: 'bullet', text: b })),
    ...(s.items ?? []).map((i) => ({ field: 'item', text: i.text })),
  ].filter((x) => x.text);
}

/** Hebrew letters as a share of all letters — Latin product names are fine, a Latin paragraph is not. */
function hebrewShare(t: string): number {
  const letters = String(t).match(/\p{L}/gu) ?? [];
  if (!letters.length) return 1;
  return letters.filter((c) => /[֐-׿]/.test(c)).length / letters.length;
}

/** Deterministic PRNG seeded from the title — same article, same design; different article, different rhythm. */
function seeded(seedText: string): () => number {
  let h = 2166136261;
  for (const ch of seedText) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

const ZONES: CarouselSlideDesign['zone'][] = ['top', 'center', 'bottom'];
const TONES: CarouselSlideDesign['tone'][] = ['plain', 'band', 'split', 'spot'];

/**
 * Fill missing design and break monotony, keeping every choice the model made that already passes.
 * Rules: no zone three times running, no tone twice running, at most two xl headlines besides the
 * hook, statement layouts (quote/stat) centred. Returns how many slides were changed.
 */
export function enforceDesignVariance(slides: CarouselStudioSlide[], seedText: string): number {
  const rnd = seeded(seedText);
  let changed = 0;
  let xlCount = 0;
  slides.forEach((s, i) => {
    const before = JSON.stringify(s.design ?? null);
    const d: CarouselSlideDesign = s.design
      ? { ...s.design }
      : {
          align: s.layout === 'quote' || s.layout === 'stat' || (s.role === 'hook' && rnd() < 0.4) ? 'center' : 'right',
          zone: s.role === 'hook' ? (['center', 'bottom', 'top'] as const)[Math.floor(rnd() * 3)] : ZONES[Math.floor(rnd() * 3)],
          tone: TONES[Math.floor(rnd() * TONES.length)],
          scale: s.role === 'hook' ? 'xl' : rnd() < 0.2 ? 'xl' : rnd() < 0.5 ? 'l' : 'm',
        };
    if (s.role === 'cta') d.zone = 'center';
    if (s.layout === 'quote' || s.layout === 'stat') d.align = 'center';
    const prev = slides[i - 1]?.design;
    const prev2 = slides[i - 2]?.design;
    if (prev && prev2 && prev.zone === d.zone && prev2.zone === d.zone) d.zone = ZONES[(ZONES.indexOf(d.zone) + 1 + Math.floor(rnd() * 2)) % 3];
    // Items and checklists are rows; a bottom-anchored stack of rows reads as a mistake. Applied
    // AFTER the rotation above, which can otherwise land a row slide on 'bottom'.
    if ((s.layout === 'items' || s.layout === 'checklist' || s.layout === 'comparison') && d.zone === 'bottom') {
      d.zone = prev?.zone === 'top' && prev2?.zone === 'top' ? 'center' : 'top';
    }
    if (prev && prev.tone === d.tone) d.tone = TONES[(TONES.indexOf(d.tone) + 1 + Math.floor(rnd() * 3)) % TONES.length];
    if (d.scale === 'xl' && s.role !== 'hook') {
      if (xlCount >= 2) d.scale = 'l';
      else xlCount++;
    }
    s.design = d;
    if (JSON.stringify(d) !== before) changed++;
  });

  // Passing the pairwise rules is not the same as having rhythm: a model that alternates two tones
  // (plain, band, plain, band…) never repeats back-to-back and still reads as a template. When a
  // deck of eight or more slides uses fewer than three tones or two zones, re-walk the middle with a
  // seeded stride so the sequence stops being periodic. Hook and CTA keep what they had.
  if (slides.length >= 8) {
    const mid = slides.slice(1, -1);
    const tones = new Set(mid.map((s) => s.design?.tone));
    const zones = new Set(mid.map((s) => s.design?.zone));
    // Period-2 repetition: the share of slides whose zone+tone equals the slide two back.
    const sig = (s?: CarouselStudioSlide) => `${s?.design?.zone}/${s?.design?.tone}`;
    const repeats = mid.filter((s, i) => i >= 2 && sig(s) === sig(mid[i - 2])).length;
    const periodic = mid.length > 4 && repeats / (mid.length - 2) > 0.4;
    // One zone+tone combination on more than a third of the slides reads as the template it is.
    const counts = new Map<string, number>();
    for (const s of mid) counts.set(sig(s), (counts.get(sig(s)) ?? 0) + 1);
    const dominant = Math.max(0, ...counts.values()) / mid.length > 0.34;
    if (tones.size < 3 || zones.size < 2 || periodic || dominant) {
      const stride = rnd() < 0.5 ? 1 : 3; // coprime with 4: every tone appears
      const offset = Math.floor(rnd() * TONES.length);
      mid.forEach((s, i) => {
        if (!s.design) return;
        s.design.tone = TONES[(offset + i * stride) % TONES.length];
        const rowLayout = s.layout === 'items' || s.layout === 'checklist' || s.layout === 'comparison';
        // Rows may sit top or center; statements anywhere. A seeded pick, then the 3-in-a-row rule again.
        const pool: CarouselSlideDesign['zone'][] = rowLayout ? ['top', 'center'] : ZONES;
        let zone = pool[Math.floor(rnd() * pool.length)];
        const p1 = mid[i - 1]?.design?.zone;
        const p2 = mid[i - 2]?.design?.zone;
        if (p1 === zone && p2 === zone) zone = pool[(pool.indexOf(zone) + 1) % pool.length];
        s.design.zone = zone;
      });
      changed += mid.length;
    }
  }
  return changed;
}

/** Numbers as written, normalised: "1,200" → "1200", "0.95" stays. Single digits are ignored —
 *  "3 שלבים" is phrasing, and item slides legitimately restate small counts. */
function numbersIn(t: string): string[] {
  return (String(t).match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, '')).filter((n) => n.length > 1 || Number(n) > 9);
}

// ─── the agent ──────────────────────────────────────────────────────────────────────────────

export async function verifyCarouselDeck(
  result: CarouselStudioResult,
  source: { title: string; body: string }
): Promise<{ slides: CarouselStudioSlide[]; verification: CarouselVerification }> {
  const slides: CarouselStudioSlide[] = result.slides.map((s) => (s.items ? { ...s, items: s.items.map((i) => ({ ...i })) } : { ...s }));
  const checks: VerificationCheck[] = [];
  const fixes: string[] = [];

  // ── 3a · coverage (first: a repair adds slides, and everything after must see them) ────────
  let coverage: CarouselVerification['coverage'] = null;
  if (result.listItems.length >= 5) {
    const coveredN = new Set<number>();
    const deckText = itemKey(slides.map((s) => [s.headline, s.body, ...s.bullets, ...(s.items ?? []).map((i) => `${i.name} ${i.text}`)].join(' ')).join(' '));
    for (const s of slides) for (const it of s.items ?? []) coveredN.add(it.n);
    // An item counts as covered when its source number was echoed on an items slide, or, failing
    // that, when its name appears anywhere in the deck (a value slide that discussed it in prose).
    const isCovered = (it: { n: number; name: string }) => {
      const key = itemKey(it.name);
      const entry = slides.flatMap((s) => s.items ?? []).find((e) => e.n === it.n);
      // The model may render a name in Hebrew; the echoed source number is the proof, not the spelling.
      if (entry) return true;
      return key.length > 2 && deckText.includes(key);
    };
    let missing = result.listItems.filter((it) => !isCovered(it));
    if (missing.length) {
      const room = IG_MAX_SLIDES - slides.length;
      try {
        const entries = room > 0 ? await synthesizeMissingListEntries({ title: source.title, items: missing }) : [];
        const byN = new Map(entries.map((e) => [e.n, e]));
        const repaired = missing.map((m) => byN.get(m.n)).filter((e): e is NonNullable<typeof e> => Boolean(e));
        if (repaired.length) {
          const newSlides: CarouselStudioSlide[] = [];
          for (let i = 0; i < repaired.length && newSlides.length < room; i += 2) {
            const chunk = repaired.slice(i, i + 2).map((e) => ({ ...e, name: e.name || missing.find((m) => m.n === e.n)?.name || '' }));
            newSlides.push({
              role: 'value',
              layout: 'items',
              kicker: 'עוד מהרשימה',
              headline: chunk.map((c) => c.name).join(' · ').slice(0, 80),
              subhead: '',
              body: '',
              bullets: [],
              bulletsLeft: [],
              columnLabels: null,
              stat: '',
              code: '',
              quote: '',
              readingTime: '',
              items: chunk,
            });
          }
          // After the last items slide, so the source order survives as far as possible.
          const lastItems = slides.map((s) => s.layout).lastIndexOf('items');
          const at = lastItems >= 0 ? lastItems + 1 : Math.max(1, slides.length - 1);
          slides.splice(at, 0, ...newSlides);
          const added = newSlides.flatMap((s) => s.items ?? []).map((e) => e.n);
          fixes.push(`נוספו ${newSlides.length} שקופיות לפריטים שהושמטו: ${added.join(', ')}`);
          missing = missing.filter((m) => !added.includes(m.n));
        }
      } catch (err) {
        console.warn('[carousel-verifier] coverage repair failed:', (err as Error)?.message);
      }
    }
    const expected = result.listItems.length;
    coverage = { expected, covered: expected - missing.length, missing: missing.map(({ n, name }) => ({ n, name })), promised: result.promisedItems };
    const promiseNote = result.promisedItems && result.promisedItems !== expected ? ` (הכותרת מבטיחה ${result.promisedItems}, חולצו ${expected})` : '';
    checks.push({
      id: 'coverage',
      label: 'כיסוי כל פריטי הרשימה',
      status: missing.length === 0 ? (promiseNote ? 'warn' : 'pass') : missing.length <= 2 ? 'warn' : 'fail',
      detail: missing.length === 0 ? `כל ${expected} הפריטים מכוסים${promiseNote}` : `חסרים ${missing.length}/${expected}: ${missing.map((m) => m.name).join(', ')}`,
    });
  }

  // ── 3c · fact-check (after coverage, so repaired items are checked too; before anti-slop, so
  //    rewritten claims are scanned for slop like everything else) ────────────────────────────
  await factCheckPass(slides, source, checks, fixes);

  // ── 4 · anti-slop ───────────────────────────────────────────────────────────────────────────
  let dropped = 0;
  for (const s of slides) {
    for (const field of ['body', 'subhead'] as const) {
      const cleaned = dropCeremonySentences(s[field]);
      if (cleaned !== s[field]) {
        s[field] = cleaned;
        dropped++;
      }
    }
  }
  if (dropped) fixes.push(`הוסרו ${dropped} משפטי טקס (כרוזים/סיומים גנריים)`);
  let reframed = 0;
  for (const s of slides) {
    const fixed = repairContrastHeadline(s.headline);
    if (fixed !== s.headline) {
      s.headline = fixed;
      reframed++;
    }
  }
  if (reframed) fixes.push(`${reframed} כותרות "לא X, אלא Y" קוצרו לטענה עצמה`);
  const slop: { slide: number; hit: SlopHit }[] = [];
  slides.forEach((s, i) => {
    if (s.role === 'cta') return; // CTA copy is templated in code
    for (const t of slideTexts(s)) for (const hit of detectSlop(t.text, { heading: t.heading })) slop.push({ slide: i + 1, hit });
  });
  checks.push({
    id: 'anti-slop',
    label: 'Anti-slop — דפוסי כתיבת AI',
    status: slop.length === 0 ? 'pass' : slop.length <= 2 ? 'warn' : 'fail',
    detail: slop.length ? slop.slice(0, 6).map((x) => `שקופית ${x.slide}: ${x.hit.kind} ("${x.hit.match}")`).join(' · ') : 'לא נמצאו דפוסים',
  });

  // ── 1 · readability ────────────────────────────────────────────────────────────────────────
  const readability: string[] = [];
  slides.forEach((s, i) => {
    const n = i + 1;
    if (words(s.headline) > 14) readability.push(`שקופית ${n}: כותרת של ${words(s.headline)} מילים`);
    if (s.layout === 'value' && words(s.body) > 70) readability.push(`שקופית ${n}: גוף של ${words(s.body)} מילים`);
    for (const it of s.items ?? []) if (words(it.text) > 45) readability.push(`שקופית ${n}: פריט "${it.name}" ארוך מדי`);
    if ((s.items?.length ?? 0) > 3) readability.push(`שקופית ${n}: ${s.items?.length} פריטים בשקופית אחת`);
    const prose = [s.headline, s.body, s.subhead, ...(s.items ?? []).map((x) => x.text)].join(' ');
    if (s.role !== 'cta' && prose.trim().length > 30 && hebrewShare(prose) < 0.45) readability.push(`שקופית ${n}: רוב הטקסט אינו בעברית`);
  });
  checks.push({
    id: 'readability',
    label: 'קריאות טקסט',
    status: readability.length === 0 ? 'pass' : readability.length <= 2 ? 'warn' : 'fail',
    detail: readability.length ? readability.slice(0, 5).join(' · ') : 'כל השקופיות בגבולות האורך ובעברית',
  });

  // ── 3b · numbers ───────────────────────────────────────────────────────────────────────────
  const src = String(source.body).replace(/,/g, '') + ' ' + String(source.title);
  const unverified = new Set<string>();
  for (const s of slides) {
    if (s.role === 'cta') continue;
    for (const t of [...slideTexts(s).map((x) => x.text), s.stat]) for (const num of numbersIn(t)) if (!src.includes(num)) unverified.add(num);
  }
  // Names: every Latin product/tool/company term on a content slide must occur in the source. A
  // model adapting an English article rarely invents a number but readily "helps" with a tool name.
  const srcLow = src.toLowerCase().replace(/[’']/g, "'");
  const unknownNames = new Set<string>();
  for (const s of slides) {
    if (s.role === 'cta') continue; // CTA copy is the brand's, not the article's
    for (const t of slideTexts(s).map((x) => x.text).concat(s.stat)) {
      // The class below holds the invisible bidi marks the sanitizer inserts (LRM, RLM, LRI…PDI).
      for (const raw of String(t).replace(/[‎‏⁦-⁩]/g, '').match(/[A-Za-z][A-Za-z0-9+_/-]*(?:\.[A-Za-z0-9]+)*/g) ?? []) {
        const w = raw.replace(/[.-]+$/, '');
        if (w.length < 2 || /^(AI|LLM|API|JSON|mrdaniel\.co\.il)$/i.test(w)) continue;
        if (!srcLow.includes(w.toLowerCase())) unknownNames.add(w);
      }
    }
  }
  checks.push({
    id: 'numbers',
    label: 'התאמה להקשר — מספרים ושמות מהמקור',
    status: unverified.size ? 'fail' : unknownNames.size ? 'warn' : 'pass',
    detail: [
      unverified.size ? `מספרים שלא מופיעים במקור: ${[...unverified].slice(0, 8).join(', ')}` : '',
      unknownNames.size ? `שמות שלא מופיעים במקור: ${[...unknownNames].slice(0, 8).join(', ')}` : '',
    ].filter(Boolean).join(' · ') || 'כל המספרים והשמות מופיעים בכתבה',
  });

  // ── 2 · layout variance (last: it must see the repaired deck) ────────────────────────────
  const mid = slides.filter((s) => s.role === 'value');
  const kinds = new Set(mid.map((s) => s.layout));
  let longestRun = 0;
  let run = 0;
  mid.forEach((s, i) => {
    // A run of `items` is the listicle's spine, not monotony — the design rotation breaks it visually.
    run = i > 0 && mid[i - 1].layout === s.layout && s.layout !== 'items' ? run + 1 : 1;
    longestRun = Math.max(longestRun, run);
  });
  const redesigned = enforceDesignVariance(slides, source.title || slides[0]?.headline || '');
  if (redesigned) fixes.push(`עיצוב הותאם ב-${redesigned} שקופיות (מיקום, ניגודיות, קנה מידה)`);
  const layoutIssues = [
    kinds.size < 3 && !kinds.has('items') ? `רק ${kinds.size} סוגי פריסה` : '',
    longestRun > 3 ? `אותה פריסה ${longestRun} פעמים ברצף` : '',
  ].filter(Boolean);
  checks.push({
    id: 'layout-variance',
    label: 'גיוון פריסה ועיצוב',
    status: layoutIssues.length ? 'warn' : 'pass',
    detail: layoutIssues.length ? layoutIssues.join(' · ') : `${kinds.size} סוגי פריסה, מיקום וניגודיות מתחלפים`,
  });

  // ── fact-check lives in its own helper below; order the report the way an operator reads it ──
  const order: VerificationCheck['id'][] = ['fact-check', 'coverage', 'numbers', 'anti-slop', 'readability', 'layout-variance'];
  checks.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

  const score = Math.max(0, 100 - checks.reduce((sum, c) => sum + (c.status === 'fail' ? 25 : c.status === 'warn' ? 8 : 0), 0));
  return {
    slides,
    verification: { passed: !checks.some((c) => c.status === 'fail'), score, checks, fixes, coverage },
  };
}

// ─── fact-check pass ────────────────────────────────────────────────────────────────────────

interface ClaimUnit {
  id: string;
  get: () => string;
  set: (v: string) => void;
  /** Item entries carry list coverage — they are rewritten, never dropped. */
  required: boolean;
}

function claimUnits(slides: CarouselStudioSlide[]): ClaimUnit[] {
  const units: ClaimUnit[] = [];
  slides.forEach((s, i) => {
    if (s.role === 'cta') return; // brand copy, not the article's claims
    const n = i + 1;
    const field = (key: 'headline' | 'subhead' | 'body' | 'quote') => {
      if (words(s[key]) >= 3) units.push({ id: `s${n}.${key}`, get: () => s[key], set: (v) => (s[key] = v), required: false });
    };
    field('headline');
    field('subhead');
    field('body');
    field('quote');
    s.bullets.forEach((_, j) => units.push({ id: `s${n}.bullet${j + 1}`, get: () => s.bullets[j], set: (v) => (s.bullets[j] = v), required: false }));
    (s.items ?? []).forEach((it) => units.push({ id: `s${n}.item${it.n}`, get: () => it.text, set: (v) => (it.text = v), required: true }));
  });
  return units;
}

async function factCheckPass(
  slides: CarouselStudioSlide[],
  source: { title: string; body: string },
  checks: VerificationCheck[],
  fixes: string[]
): Promise<void> {
  const units = claimUnits(slides);
  const byId = new Map(units.map((u) => [u.id, u]));
  const issues: string[] = [];
  let corrected = 0;
  let dropped = 0;
  let unresolved = 0;
  let unchecked = 0;
  const evidence = [source.title, source.body].join(' — ');
  try {
    const first = await factCheckCarouselClaims({ source: evidence, units: units.map((u) => ({ id: u.id, text: u.get() })) });
    const answered = new Set(first.map((v) => v.id));
    unchecked = units.filter((u) => !answered.has(u.id)).length;
    const changed: ClaimUnit[] = [];
    for (const v of first) {
      if (v.verdict !== 'fix') continue;
      const u = byId.get(v.id);
      if (!u) continue;
      issues.push(`${v.id}: ${v.issue || 'לא נאמן למקור'}`);
      if (v.fix) {
        u.set(v.fix);
        changed.push(u);
        corrected++;
      } else if (!u.required) {
        u.set('');
        dropped++;
      } else {
        unresolved++;
      }
    }
    // Confirmation: a rewrite is itself model output, so it is checked once more on its own.
    if (changed.length) {
      const second = await factCheckCarouselClaims({ source: evidence, units: changed.map((u) => ({ id: u.id, text: u.get() })) });
      for (const v of second) {
        if (v.verdict !== 'fix') continue;
        const u = byId.get(v.id);
        if (!u) continue;
        if (v.fix) u.set(v.fix);
        else if (!u.required) {
          u.set('');
          dropped++;
        } else unresolved++;
      }
    }
  } catch (err) {
    console.warn('[carousel-verifier] fact-check failed:', (err as Error)?.message);
    checks.push({ id: 'fact-check', label: 'בדיקת עובדות מול המקור', status: 'warn', detail: 'בדיקת העובדות לא רצה (שגיאת מודל) — יש לקרוא את הטענות מול הכתבה לפני פרסום' });
    return;
  }

  // A bullet emptied by the check leaves a hole; a value slide emptied entirely has nothing to render.
  for (const s of slides) s.bullets = s.bullets.filter(Boolean);
  for (let i = slides.length - 1; i >= 0; i--) {
    const s = slides[i];
    if (s.role === 'value' && !s.headline && !s.body && !s.quote && !s.stat && !s.bullets.length && !(s.items?.length) && !s.code) slides.splice(i, 1);
  }

  if (corrected || dropped) fixes.push(`בדיקת עובדות: תוקנו ${corrected} טענות${dropped ? `, הוסרו ${dropped}` : ''} — ${issues.slice(0, 3).join(' · ')}`);
  checks.push({
    id: 'fact-check',
    label: 'בדיקת עובדות מול המקור',
    status: unresolved ? 'fail' : unchecked ? 'warn' : 'pass',
    detail: unresolved
      ? `${unresolved} טענות לא נאמנות למקור ולא ניתנו לתיקון`
      : unchecked
        ? `${unchecked}/${units.length} טענות לא נבדקו`
        : `${units.length} טענות נבדקו מול הכתבה${corrected || dropped ? ` · ${corrected} תוקנו${dropped ? `, ${dropped} הוסרו` : ''}` : ' · כולן נאמנות למקור'}`,
  });
}
