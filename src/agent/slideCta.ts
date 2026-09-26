/**
 * Slide-copy CTA stripping, shared by every deck producer.
 *
 * Moved out of src/server/agents/threadsThreadAgent.ts on 2026-09-26: the tech-tip generator in
 * SocialAgentEngine.ts needs the same rule, and the engine cannot import the Threads agent (the
 * agent imports the engine). No imports, so either side can depend on it.
 */

/**
 * Strips link overlays and comment-bait out of slide copy.
 *
 * Two separate jobs that happen to have the same fix. The model is told not to write a URL or a
 * "write X in the comments" line into a slide, but an instruction is not an enforcement: the source
 * thread often ends with exactly that, and an adaptation faithful to the source will carry it
 * through. A printed URL is dead pixels in a PNG, and comment-bait is against the repo's
 * no-engagement-bait rule, so both are removed in code, on every slide, every run.
 *
 * Applied to prose only — never to `code`, where a URL can be a real part of the snippet.
 */
export function stripSlideCta(text: string): string {
  return String(text || '')
    // Absolute URLs, www-prefixed hosts, and any bare domain carrying a path.
    .replace(/\bhttps?:\/\/[^\s)"'\]]+/gi, '')
    .replace(/\bwww\.[^\s)"'\]]+/gi, '')
    .replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|co\.il|io|net|org|ai|dev|app)\/[^\s)"'\]]*/gi, '')
    // Our own domain is removed even bare — it is the one the model is most likely to volunteer.
    // A bare third-party domain is NOT: "make.com" and "n8n.io" are tool names the reader needs,
    // and stripping them would silently gut the very instruction the slide exists to give.
    .replace(/\bmrdaniel\.co\.il\b/gi, '')
    // "כתבו/הגיבו/שלחו <keyword> בתגובות / ב-DM" and its English twin.
    //
    // Each of these consumes the rest of its sentence AND that sentence's closing punctuation
    // (`[.!?]*`). Without the second part the period stayed behind, so removing a trailing bait
    // sentence left the slide reading "…let it run nightly.." — the doubled stop being the only
    // visible trace of the thing that was supposed to disappear cleanly.
    .replace(/(?:כתבו|רשמו|הגיבו|תגיבו|שלחו|תשלחו)\s+(?:לי\s+)?[^\s,.!?]{1,24}\s*(?:בתגובות|בתגובה|בהודעה|ב-?DM|בדיאם)[^.!?\n]*[.!?]*/gi, '')
    .replace(/\b(?:comment|dm|write)\s+["“']?\w{1,24}["”']?\s+(?:below|to get|for the)[^.!?\n]*[.!?]*/gi, '')
    // "הקישור בביו" and friends — the link is in the caption, not on the slide.
    //
    // The leading `\b` was removed on 2026-09-12: it is an ASCII word boundary, and Hebrew letters
    // are not ASCII word characters, so `\bהקישור` asserts a boundary between two non-word
    // positions and can never match. The rule had therefore never once fired. No anchor is needed
    // in its place — "הקישורים בביו" still cannot match, because `\s+` must follow "הקישור".
    .replace(/(?:הקישור|קישור|לינק)\s+(?:נמצא\s+)?(?:בביו|בבio|בתגובה הראשונה|למטה)[^.!?\n]*[.!?]*/gi, '')
    // The English twin, added 2026-09-12: only the (dead) Hebrew form was covered, so "Link in bio
    // for the full guide." survived onto a slide verbatim — a dead string painted into a PNG. It
    // matters most for the Instagram importer, where that line is the house style of almost every
    // source caption, but the gap was the same on the Threads path and is fixed for both here.
    .replace(/\b(?:the\s+)?link'?s?\s+(?:is\s+)?in\s+(?:my\s+|the\s+)?bio[^.!?\n]*[.!?]*/gi, '')
    .replace(/\b(?:swipe up|tap the link|check the link|link below)[^.!?\n]*[.!?]*/gi, '')
    // Whatever furniture the removals left behind.
    // An isolate pair that wrapped a removed Latin run (the Hebrew sanitizer adds them) is now empty.
    .replace(/[⁦-⁨][\s‎‏]*⁩/g, '')
    // A Hebrew one-letter prefix whose object was the removed domain: "בואו ל-MrDaniel.co.il" left
    // "בואו ל-", "עוד מדריכים ב-mrdaniel.co.il." left "ב-.". A lone ב/ל/מ/ה/ו/כ/ש with nothing
    // after it but punctuation or the end of the line is never Hebrew, so it goes too.
    .replace(/(^|\s)[בלמהוכש][-־]?[‎‏]*(?=\s*(?:[.,;:!?]|$))/g, '$1')
    // Mid-sentence twin: "היכנסו ל-https://… ותורידו" left "ל- ותורידו". A prefix hyphen is a
    // join to the next word, so one followed by whitespace had its word removed.
    .replace(/(^|\s)[בלמהוכש][-־][‎‏]*(?=\s)/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[\s,;:.\-–—]+/, '')
    .replace(/[\s,;:\-–—]+$/, '')
    .trim();
}
