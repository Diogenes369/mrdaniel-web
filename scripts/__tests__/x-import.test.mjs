// X (Twitter) importer: does a pasted link resolve to the right post, do Hebrew subtitles come out
// as a file a player will actually accept, does a video transcript become a real deck, and do the
// server and dashboard copies of the cue formatter still agree?
//
// No keys, no network, no quota: every case stops at URL parsing, payload parsing, cue repair or
// deck layout. The one fixture is a trimmed copy of a REAL syndication response (post
// 2087025097546809533, captured 2026-09-21), so the media shape under test is the shape X actually
// serves rather than one invented here.
// Run: npx tsx scripts/__tests__/x-import.test.mjs
import {
  cleanPostText,
  extractXVideo,
  isXUrl,
  isXVideoUrl,
  normalizeXUrl,
  parseXRawText,
  pickTranscriptionVariant,
  proxiedXImage,
  syndicationToken,
  MIN_X_CHARS,
} from '../../src/server/xPostFetcher.ts';
import {
  buildSrt,
  buildVtt,
  cuesToTranscript,
  formatTimestamp,
  normalizeCues,
  wrapCueText,
  MAX_CUE_LINE_CHARS,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
} from '../../src/server/xSubtitles.ts';
import { buildLocalXDeck, buildXSegments, segmentTranscript } from '../../src/server/agents/xPostAgent.ts';
import { analyzeThreadTopic } from '../../src/server/agents/threadsThreadAgent.ts';
import * as clientCues from '../../dashboard/src/lib/xSubtitleFormat.ts';
import { readFileSync } from 'node:fs';

const results = [];
const t = (label, cond, detail = '') => results.push([cond ? 'PASS' : 'FAIL', label, cond ? '' : detail]);

// ─── URL parsing ──────────────────────────────────────────────────────────────────────────────
// Everything an operator actually pastes: the share-sheet URL with its `?s=` tracking, the mobile
// host, the legacy twitter.com domain, the `/i/status/` form X's own redirects emit, a deep link
// into one photo of a carousel, and a mirror host a third-party client rewrote to.

const ID = '2087025097546809533';
const cases = [
  ['canonical', `https://x.com/AlexFinn/status/${ID}`, ID, '@AlexFinn'],
  ['share tracking dropped', `https://x.com/AlexFinn/status/${ID}?s=20&t=abc_DEF`, ID, '@AlexFinn'],
  ['legacy twitter.com', `https://twitter.com/AlexFinn/status/${ID}`, ID, '@AlexFinn'],
  ['mobile host', `https://mobile.twitter.com/AlexFinn/status/${ID}`, ID, '@AlexFinn'],
  ['www prefix', `https://www.x.com/AlexFinn/status/${ID}`, ID, '@AlexFinn'],
  ['/i/status/ form', `https://x.com/i/status/${ID}`, ID, ''],
  ['/i/web/status/ form', `https://x.com/i/web/status/${ID}`, ID, ''],
  ['photo deep link', `https://x.com/AlexFinn/status/${ID}/photo/1`, ID, '@AlexFinn'],
  ['video deep link', `https://x.com/AlexFinn/status/${ID}/video/1`, ID, '@AlexFinn'],
  ['legacy /statuses/ path', `https://twitter.com/AlexFinn/statuses/${ID}`, ID, '@AlexFinn'],
  ['fxtwitter mirror', `https://fxtwitter.com/AlexFinn/status/${ID}`, ID, '@AlexFinn'],
  ['no scheme', `x.com/AlexFinn/status/${ID}`, ID, '@AlexFinn'],
  ['link inside a sentence', `look at this https://x.com/AlexFinn/status/${ID} it is wild`, ID, '@AlexFinn'],
  ['trailing sentence punctuation', `see https://x.com/AlexFinn/status/${ID}.`, ID, '@AlexFinn'],
  // Posts from 2006-08 have ids far shorter than today's snowflakes; jack's first tweet is id 20.
  // A five-digit floor rejected them outright, which read to the operator as "invalid link".
  ['a short legacy id', 'https://x.com/jack/status/20', '20', '@jack'],
];
for (const [label, input, id, handle] of cases) {
  const got = normalizeXUrl(input);
  t(`url · ${label}`, got?.id === id && got?.handle === handle, JSON.stringify(got));
}

// Every accepted form must canonicalise onto x.com — a mirror host must never survive into a fetch.
t(
  'url · every form canonicalises to x.com',
  cases.every(([, input]) => normalizeXUrl(input)?.url.startsWith('https://x.com/')),
  cases.map(([l, i]) => `${l}: ${normalizeXUrl(i)?.url}`).join(' | ')
);
t('url · tracking params never survive', !normalizeXUrl(`https://x.com/a/status/${ID}?s=20`)?.url.includes('?'));

for (const bad of [
  '',
  'https://x.com/AlexFinn',
  'https://x.com/AlexFinn/status/',
  'https://x.com/AlexFinn/status/abc',
  'https://example.com/AlexFinn/status/123456789',
  'https://xcom.evil.com/a/status/123456789',
  'just some text',
  'https://x.com/i/lists/1234567890',
]) {
  t(`url · rejects ${JSON.stringify(bad).slice(0, 44)}`, !isXUrl(bad), JSON.stringify(normalizeXUrl(bad)));
}

// The syndication token is X's own embed checksum. Wrong = every fetch 404s, and the failure looks
// like a deleted post rather than like a bug, so the algorithm is pinned.
t('url · syndication token matches the embed algorithm', syndicationToken('20') === ((20 / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, ''), syndicationToken('20'));
t('url · syndication token is stable per id', syndicationToken(ID) === syndicationToken(ID) && syndicationToken(ID).length > 0);

// ─── media URL guards ─────────────────────────────────────────────────────────────────────────
// Both of these decide what the browser is told to fetch on the operator's behalf, so an off-host
// URL has to be rejected rather than merely unusual.

t('media · proxies a pbs.twimg.com photo', proxiedXImage('https://pbs.twimg.com/media/BhxWutnCEAAtEQ6.jpg').startsWith('https://mrdaniel.co.il/api/img-proxy?url='));
t('media · asks the CDN for the large rendition', decodeURIComponent(proxiedXImage('https://pbs.twimg.com/media/X.jpg')).includes('name=large'));
for (const bad of ['http://pbs.twimg.com/media/X.jpg', 'https://evil.com/x.jpg', 'https://pbs.twimg.com.evil.com/x.jpg', '']) {
  t(`media · refuses to proxy ${JSON.stringify(bad).slice(0, 40)}`, proxiedXImage(bad) === '', proxiedXImage(bad));
}
t('media · accepts a real video.twimg.com mp4', isXVideoUrl('https://video.twimg.com/amplify_video/1/vid/avc1/698x360/a.mp4'));
for (const bad of [
  'https://video.twimg.com/amplify_video/1/pl/a.m3u8',
  'http://video.twimg.com/a.mp4',
  'https://video.twimg.com.evil.com/a.mp4',
  'https://evil.com/a.mp4',
]) {
  t(`media · refuses video url ${JSON.stringify(bad).slice(0, 48)}`, !isXVideoUrl(bad));
}

// ─── syndication payload → post + video ───────────────────────────────────────────────────────
// Trimmed from the live response for post 2087025097546809533 (2026-09-21). The two media shapes
// (`mediaDetails[].video_info` and the flattened `video`) are both present, exactly as X sends them.

const payload = {
  id_str: ID,
  text: 'Here is EVERY AI tool you need in 2026. How to use each is in the video! https://t.co/FAol8DgfLx',
  display_text_range: [0, 72],
  user: { screen_name: 'AlexFinn', name: 'Alex Finn' },
  mediaDetails: [
    {
      type: 'video',
      media_url_https: 'https://pbs.twimg.com/amplify_video_thumb/2087023876270407680/img/9Oj4R1Y08tmS-eTN.jpg',
      video_info: {
        aspect_ratio: [64, 33],
        duration_millis: 843906,
        variants: [
          { content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/amplify_video/2087023876270407680/pl/XdZ1AL5H1m3tNkm8.m3u8?v=c98' },
          { bitrate: 256000, content_type: 'video/mp4', url: 'https://video.twimg.com/amplify_video/2087023876270407680/vid/avc1/522x270/WZgggNQhA4SrAX4B.mp4' },
          { bitrate: 832000, content_type: 'video/mp4', url: 'https://video.twimg.com/amplify_video/2087023876270407680/vid/avc1/698x360/hFIy89tGAfa0WD8H.mp4' },
          { bitrate: 2176000, content_type: 'video/mp4', url: 'https://video.twimg.com/amplify_video/2087023876270407680/vid/avc1/1396x720/SsGfGJ2n2wLah3tH.mp4' },
          { bitrate: 10368000, content_type: 'video/mp4', url: 'https://video.twimg.com/amplify_video/2087023876270407680/vid/avc1/2094x1080/lAlcHkwLEVDQuADH.mp4' },
        ],
      },
    },
  ],
  video: {
    aspectRatio: [64, 33],
    durationMs: 843906,
    poster: 'https://pbs.twimg.com/amplify_video_thumb/2087023876270407680/img/9Oj4R1Y08tmS-eTN.jpg',
    variants: [
      { type: 'application/x-mpegURL', src: 'https://video.twimg.com/amplify_video/2087023876270407680/pl/XdZ1AL5H1m3tNkm8.m3u8?v=c98' },
      { type: 'video/mp4', src: 'https://video.twimg.com/amplify_video/2087023876270407680/vid/avc1/522x270/WZgggNQhA4SrAX4B.mp4' },
    ],
  },
};

const text = cleanPostText(payload);
t('payload · drops the trailing media t.co shortlink', !/t\.co/.test(text), text);
t(
  'payload · keeps the human-written sentence',
  text === 'Here is EVERY AI tool you need in 2026. How to use each is in the video!',
  JSON.stringify(text)
);
t(
  'payload · display_text_range is counted in code points, not UTF-16 units',
  cleanPostText({ text: '🚀🚀 real text https://t.co/x', display_text_range: [0, 12] }) === '🚀🚀 real text',
  JSON.stringify(cleanPostText({ text: '🚀🚀 real text https://t.co/x', display_text_range: [0, 12] }))
);
t('payload · unescapes html entities', cleanPostText({ text: 'a &amp; b' }) === 'a & b');

const video = extractXVideo(payload);
t('video · found', Boolean(video));
t('video · HLS playlists are dropped', video.variants.every((v) => v.url.endsWith('.mp4')), video.variants.map((v) => v.url).join(' '));
t('video · every variant is deduped across both payload shapes', new Set(video.variants.map((v) => v.url)).size === video.variants.length);
t('video · exactly the four mp4 renditions survive', video.variants.length === 4, String(video.variants.length));
t('video · sorted largest first', video.variants[0].height === 1080 && video.variants.at(-1).height === 270, video.variants.map((v) => v.height).join(','));
t('video · size is read out of the variant url', video.variants[0].width === 2094 && video.variants[0].height === 1080);
t('video · duration and aspect survive', video.durationMs === 843906 && video.aspectRatio[0] === 64);
t('video · poster is proxied', video.poster.startsWith('https://mrdaniel.co.il/api/img-proxy?url='));
t('video · a photo-only post yields no video', extractXVideo({ mediaDetails: [{ type: 'photo', media_url_https: 'https://pbs.twimg.com/media/a.jpg' }] }) === undefined);
t('video · an animated gif is flagged as such', extractXVideo({ mediaDetails: [{ type: 'animated_gif', video_info: { variants: [{ content_type: 'video/mp4', url: 'https://video.twimg.com/tweet_video/a.mp4' }] } }] })?.kind === 'animated_gif');

// The transcription pick is a cost decision: speech does not get clearer at 1080p, and the byte
// budget is what keeps the inline request under Gemini's 20 MB request ceiling.
const pick = pickTranscriptionVariant(video);
t('video · transcription picks the smallest usable rendition', pick.height === 270, JSON.stringify(pick));
t('video · transcription falls back when nothing meets the floor', pickTranscriptionVariant({ variants: [{ url: 'https://video.twimg.com/a/vid/avc1/160x90/a.mp4', bitrate: 1, width: 160, height: 90 }] }).height === 90);
t('video · transcription pick is undefined without a video', pickTranscriptionVariant(undefined) === undefined);
t('video · the byte cap leaves base64 headroom under Gemini\'s 20MB request limit', MAX_VIDEO_BYTES * (4 / 3) < 20 * 1024 * 1024, String(MAX_VIDEO_BYTES));

// ─── manual paste ─────────────────────────────────────────────────────────────────────────────
// What lands on the clipboard when an operator selects a thread in the X web client: a name/handle
// header, engagement counts, "Show this thread", and the numbered parts themselves.

const pasted = parseXRawText(
  [
    'Alex Finn @AlexFinn · 3h',
    '1/ Most people use Gemini wrong. Here is the workflow that actually saves hours every week.',
    '2/ Open Tools -> Canvas and paste this prompt to get a first draft you can edit.',
    '3/ Then export it and run it through your own checklist before you publish anything.',
    '1.2K',
    'Show this thread',
    '482 likes',
  ].join('\n'),
  `https://x.com/AlexFinn/status/${ID}`
);
t('paste · splits numbered parts into posts', pasted.posts.length === 3, JSON.stringify(pasted.posts));
t('paste · recovers the handle from the header', pasted.author === '@AlexFinn', pasted.author);
t('paste · the header line never becomes content', !pasted.posts.join(' ').includes('@AlexFinn'), pasted.posts[0]);
t('paste · engagement counts are dropped', !/1\.2K|482 likes|Show this thread/.test(pasted.posts.join(' ')), pasted.posts.join(' | '));
t('paste · the part markers are stripped', !pasted.posts.some((p) => /^\d\//.test(p)), pasted.posts.join(' | '));
t('paste · canonicalises the url it was given', pasted.url === `https://x.com/AlexFinn/status/${ID}`, pasted.url);
t('paste · ok once past the source floor', pasted.ok && pasted.text.length >= MIN_X_CHARS);
t('paste · replyCount counts the extra parts', pasted.replyCount === 2, String(pasted.replyCount));
t('paste · t.co links are stripped from pasted text', !parseXRawText('Check this out https://t.co/AbCd1234 and then read the rest of this line carefully please').text.includes('t.co'));

const thin = parseXRawText('too short');
t('paste · thin input is not ok', !thin.ok && /קצר מדי/.test(thin.note ?? ''), JSON.stringify(thin.note));
t('paste · empty input reports it', !parseXRawText('').ok);

// A single-post paste with no numbering must stay one post, not be shredded on every newline.
const single = parseXRawText('This is one long single post about building an agent that reads your inbox and drafts replies.');
t('paste · an unnumbered single post stays one post', single.posts.length === 1, JSON.stringify(single.posts));

// ─── Hebrew subtitle formatting ───────────────────────────────────────────────────────────────

t('srt · timestamp format', formatTimestamp(3_661_234) === '01:01:01,234', formatTimestamp(3_661_234));
t('srt · sub-second zero padding', formatTimestamp(7) === '00:00:00,007', formatTimestamp(7));
t('srt · negative clamps to zero', formatTimestamp(-500) === '00:00:00,000', formatTimestamp(-500));
t('vtt · uses a dot separator', formatTimestamp(1500, '.') === '00:00:01.500', formatTimestamp(1500, '.'));

const longLine = 'זה משפט ארוך מאוד בעברית שנועד לבדוק איך בדיוק הגלישה לשורות עובדת בכתובית אמיתית';
const wrapped = wrapCueText(longLine);
t('wrap · never exceeds two lines', wrapped.split('\n').length <= 2, JSON.stringify(wrapped));
t('wrap · no line exceeds the character budget', wrapped.split('\n').every((l) => l.length <= MAX_CUE_LINE_CHARS), JSON.stringify(wrapped));
t('wrap · never splits a word', wrapped.split('\n').every((l) => longLine.includes(l.replace('…', '').trim())), JSON.stringify(wrapped));
// Past two lines' worth there is nowhere left to put the words, and dropping them without a mark
// would show the reader a confident half-sentence. The overflow has to be visible.
const overflowing = wrapCueText(`${longLine} ${longLine}`);
t('wrap · overflow is ellipsised, not dropped silently', overflowing.endsWith('…'), JSON.stringify(overflowing));
t('wrap · the ellipsis does not push a line over budget', overflowing.split('\n').every((l) => l.length <= MAX_CUE_LINE_CHARS), JSON.stringify(overflowing));
t('wrap · a short line is untouched', wrapCueText('שלום עולם') === 'שלום עולם');
t('wrap · empty in, empty out', wrapCueText('   ') === '');

// The bidi rule this whole pipeline exists to satisfy: a cue that OPENS on a Latin product name is
// laid out left-to-right by the first-strong-character rule, which throws the Hebrew after it to
// the wrong side — in VLC, in the browser's own <track> renderer and on the burn canvas alike.
const RLM = '‏';
const mixed = normalizeCues([{ startMs: 0, endMs: 2000, text: 'Claude Opus 5 מריץ את זה מקומית' }], 10000);
t('bidi · every cue line opens with an RLM', mixed[0].text.split('\n').every((l) => l.startsWith(RLM)), JSON.stringify(mixed[0].text));
t('bidi · the Latin product name survives intact', mixed[0].text.includes('Claude Opus 5'), JSON.stringify(mixed[0].text));

// ─── cue repair ───────────────────────────────────────────────────────────────────────────────
// Each case below is a mistake the model actually makes and that no prompt wording reliably
// prevents, which is why the repair is code rather than an instruction.

const repaired = normalizeCues(
  [
    { startMs: 5000, endMs: 7000, text: 'שלישית' },
    { startMs: 0, endMs: 2500, text: 'ראשונה' },
    { startMs: 2000, endMs: 4000, text: 'שנייה שחופפת' },
    { startMs: 8000, endMs: 7000, text: 'מסתיימת לפני שהתחילה' },
    { startMs: 12000, endMs: 60000, text: 'ארוכה מדי' },
    { startMs: 99000, endMs: 99500, text: 'אחרי סוף הסרטון' },
    { startMs: 1000, endMs: 2000, text: '   ' },
  ],
  20000
);
t('cues · sorted by start time', repaired.every((c, i) => i === 0 || repaired[i - 1].startMs <= c.startMs), JSON.stringify(repaired.map((c) => c.startMs)));
t('cues · no two cues overlap', repaired.every((c, i) => i === 0 || repaired[i - 1].endMs <= c.startMs), JSON.stringify(repaired.map((c) => [c.startMs, c.endMs])));
t('cues · every cue ends after it starts', repaired.every((c) => c.endMs > c.startMs));
t('cues · nothing runs past the clip', repaired.every((c) => c.endMs <= 20000), JSON.stringify(repaired.map((c) => c.endMs)));
t('cues · a cue past the end is dropped', !repaired.some((c) => c.startMs >= 20000));
t('cues · no cue exceeds the 7s ceiling', repaired.every((c) => c.endMs - c.startMs <= 7000), JSON.stringify(repaired.map((c) => c.endMs - c.startMs)));
t('cues · every cue clears the 0.8s floor', repaired.every((c) => c.endMs - c.startMs >= 800));
t('cues · blank cues are dropped', !repaired.some((c) => !c.text.trim()));
t('cues · an unbounded duration still normalises', normalizeCues([{ startMs: 0, endMs: 1000, text: 'בלי אורך ידוע' }], 0).length === 1);
t('cues · an empty list stays empty', normalizeCues([], 5000).length === 0);
t('cues · the source line is preserved for verification', normalizeCues([{ startMs: 0, endMs: 2000, text: 'עברית', source: 'the english' }], 5000)[0].source === 'the english');

// ─── SRT / VTT files ──────────────────────────────────────────────────────────────────────────

const track = normalizeCues(
  [
    { startMs: 400, endMs: 3100, text: 'פותחים את Gemini ובוחרים Canvas' },
    { startMs: 3400, endMs: 6000, text: 'מדביקים את הפרומפט ומריצים אותו' },
  ],
  12000
);
const srt = buildSrt(track);
t('srt · cues are numbered from 1', /^1\r\n/.test(srt), JSON.stringify(srt.slice(0, 20)));
t('srt · uses the arrow separator with a comma timestamp', /00:00:00,400 --> 00:00:03,100/.test(srt), srt.split('\r\n')[1]);
t('srt · uses CRLF line endings', srt.includes('\r\n') && !/[^\r]\n/.test(srt));
t('srt · ends on a blank line', srt.endsWith('\r\n\r\n') || srt.endsWith('\r\n'), JSON.stringify(srt.slice(-6)));
t('srt · every cue made it into the file', srt.includes('Gemini') && srt.includes('Canvas'));
t('srt · an empty track is an empty file, not a malformed one', buildSrt([]).trim() === '');

const vtt = buildVtt(track);
t('vtt · opens with the WEBVTT signature', vtt.startsWith('WEBVTT'), vtt.slice(0, 12));
t('vtt · uses a dot timestamp', /00:00:00\.400 --> 00:00:03\.100/.test(vtt), vtt.split('\n').find((l) => l.includes('-->')));
t('vtt · declares RTL cue direction', /direction:\s*rtl/.test(vtt));
t('vtt · lifts cues clear of the player controls', /line:85%/.test(vtt));

t('transcript · flattens cues into prose without the bidi marks', cuesToTranscript(track) === 'פותחים את Gemini ובוחרים Canvas מדביקים את הפרומפט ומריצים אותו', JSON.stringify(cuesToTranscript(track)));

// ─── server ↔ dashboard mirror ────────────────────────────────────────────────────────────────
// The operator EDITS the cue list, so the repair + formatting pass runs client-side too. Drift
// between the two copies means a downloaded SRT stops matching the burned-in video, which is
// invisible until someone plays the file. `check:mirrors` only compares type declarations, so the
// behaviour is compared here instead.

const drifty = [
  { startMs: 5000, endMs: 7000, text: 'Claude Opus 5 שלישית' },
  { startMs: 0, endMs: 2500, text: 'ראשונה' },
  { startMs: 2000, endMs: 40000, text: 'שנייה חופפת וארוכה מדי מאוד מאוד מאוד מאוד מאוד מאוד מאוד ארוכה' },
];
const serverSide = normalizeCues(drifty, 20000);
const clientSide = clientCues.normalizeCues(drifty, 20000);
t('mirror · normalizeCues agrees', JSON.stringify(serverSide) === JSON.stringify(clientSide), `${JSON.stringify(serverSide)}\n!==\n${JSON.stringify(clientSide)}`);
t('mirror · buildSrt agrees', buildSrt(serverSide) === clientCues.buildSrt(clientSide));
t('mirror · buildVtt agrees', buildVtt(serverSide) === clientCues.buildVtt(clientSide));
t('mirror · wrapCueText agrees', wrapCueText(longLine) === clientCues.wrapCueText(longLine));
t('mirror · formatTimestamp agrees', formatTimestamp(3_661_234) === clientCues.formatTimestamp(3_661_234));
t('mirror · cuesToTranscript agrees', cuesToTranscript(serverSide) === clientCues.cuesToTranscript(clientSide));
t('mirror · the character budget is the same on both sides', MAX_CUE_LINE_CHARS === clientCues.MAX_CUE_LINE_CHARS);

// `cueAt` only exists client-side (it drives the burn loop), so it is checked on its own.
t('cueAt · finds the cue covering the instant', clientCues.cueAt(track, 1000)?.text.includes('Gemini'));
t('cueAt · returns null in a gap', clientCues.cueAt(track, 3200) === null);
t('cueAt · returns null past the last cue', clientCues.cueAt(track, 99000) === null);
t('cueAt · the end of a cue is exclusive', clientCues.cueAt(track, track[0].endMs) === null);

// ─── transcript → deck source ─────────────────────────────────────────────────────────────────
// The thing this tab does that the Threads tab cannot: a one-line post over a screencast is not a
// deck, so what was SAID has to become the deck's body.

// Roughly two and a half minutes of narration — long enough that the default 60-word segment
// target has to cut it into several slides, which is the case the deck actually depends on.
const spoken =
  'פותחים את Gemini ובוחרים Canvas מהתפריט העליון של הכלי. מדביקים את הפרומפט הראשון ומריצים אותו פעם אחת. ' +
  'עכשיו מוסיפים את הקובץ שרוצים לנתח ולוחצים על הכפתור הכחול בפינה. ' +
  'התוצאה מופיעה בצד ימין ואפשר לערוך אותה ישירות בתוך החלון בלי לצאת. ' +
  'אם משהו לא מדויק מבקשים תיקון בשפה חופשית והמודל מעדכן רק את החלק הרלוונטי. ' +
  'בשלב הזה כדאי לשמור גרסה כדי שיהיה אפשר לחזור אחורה אם התיקון הבא יקלקל משהו. ' +
  'אחר כך מחברים את הפלט לגיליון שכבר קיים אצלכם ומגדירים עמודה לכל שדה. ' +
  'בסוף מייצאים את הכל לקובץ אחד ושומרים אותו בדרייב המשותף של הצוות. ' +
  'זה כל התהליך, ולוקח פחות מחמש דקות מקצה לקצה בלי שום כלי נוסף.';

const segments = segmentTranscript(spoken, 12);
t('segments · a transcript is cut into slide-sized units', segments.length > 1, String(segments.length));
t('segments · never cuts mid-sentence', segments.every((s) => /[.!?׃]$/.test(s.trim()) || s === segments.at(-1)), JSON.stringify(segments));
t('segments · loses no words', segments.join(' ').replace(/\s+/g, ' ') === spoken.replace(/\s+/g, ' ').trim(), JSON.stringify(segments.join(' ')));
t('segments · caps the unit count', segmentTranscript(`${spoken} ${spoken} ${spoken} ${spoken}`, 8).length <= 10);
t('segments · an empty transcript yields nothing', segmentTranscript('').length === 0);
t('segments · a transcript with no punctuation still splits', segmentTranscript('מילה '.repeat(200), 20).length > 1);

const videoPost = {
  ok: true,
  url: `https://x.com/AlexFinn/status/${ID}`,
  id: ID,
  author: '@AlexFinn',
  authorName: 'Alex Finn',
  posts: ['Watch this 👇'],
  items: [{ text: 'Watch this 👇', images: [] }],
  images: [],
  replyCount: 0,
  text: 'Watch this 👇',
  via: 'syndication',
};
const merged = buildXSegments(videoPost, spoken);
t('source · a bare "watch this" post is folded into the first spoken segment, not given a slide', merged[0].startsWith('Watch this'), JSON.stringify(merged[0]));
t('source · the transcript supplies the rest of the deck', merged.length > 1, String(merged.length));

const richPost = { ...videoPost, posts: ['Most people use Gemini wrong. Here is the workflow that actually saves hours every week.'] };
const richMerged = buildXSegments(richPost, spoken);
t('source · a real post keeps its own opening segment', richMerged[0] === richPost.posts[0], JSON.stringify(richMerged[0]));
t('source · the post text comes before the narration', richMerged.indexOf(richPost.posts[0]) === 0);
t('source · no transcript means the post text alone', buildXSegments(richPost, '').length === 1);

// ─── deck structure ───────────────────────────────────────────────────────────────────────────
// The local deck is what an operator sees whenever the model's output is unusable, so its shape is
// part of the contract, not a degraded afterthought.

const topic = analyzeThreadTopic(merged.join('\n'));
const deck = buildLocalXDeck(merged, [], topic);
t('deck · opens on a cover', deck.slides[0].kind === 'cover', deck.slides[0].kind);
t('deck · closes on a CTA', deck.slides.at(-1).kind === 'cta', deck.slides.at(-1).kind);
t('deck · has content between them', deck.slides.length >= 3, String(deck.slides.length));
t('deck · every slide carries the topic badge', deck.slides.every((s) => Boolean(s.badge)), JSON.stringify(deck.slides.map((s) => s.badge)));
t('deck · every slide carries the theme', deck.slides.every((s) => Boolean(s.theme)));
t('deck · content slides are numbered n / N', deck.slides.slice(1, -1).every((s) => /^\d+ \/ \d+$/.test(s.stepLabel ?? '')), JSON.stringify(deck.slides.map((s) => s.stepLabel)));
t('deck · the CTA carries no step indicator', deck.slides.at(-1).stepLabel === undefined);
t('deck · no link is ever painted on a slide', !deck.slides.some((s) => /https?:\/\/|www\.|mrdaniel\.co\.il/.test(`${s.title} ${s.body} ${s.bullets.join(' ')}`)), JSON.stringify(deck.slides.map((s) => s.body)));
t('deck · the CTA slide carries no clickable url field', deck.slides.at(-1).ctaUrl === undefined);
t('deck · every slide has a title', deck.slides.every((s) => s.title.trim().length > 0), JSON.stringify(deck.slides.map((s) => s.title)));
t('deck · hashtags are present and capped', deck.hashtags.length >= 3 && deck.hashtags.length <= 5, JSON.stringify(deck.hashtags));
t('deck · a source image lands on the cover when the post had one', buildLocalXDeck(merged, ['https://mrdaniel.co.il/api/img-proxy?url=a'], topic).slides[0].sourceImage !== undefined);
t('deck · an empty source still produces a valid deck', buildLocalXDeck([], [], topic).slides.length >= 2);

// The theme scoring has to see the transcript, or a one-line post over an n8n screencast is filed
// as "general" and renders in the wrong accent with the wrong guide.
t('deck · the theme is scored on the transcript too', analyzeThreadTopic(buildXSegments(videoPost, 'setting up an n8n automation workflow with a webhook trigger').join('\n')).theme === 'automation', analyzeThreadTopic(buildXSegments(videoPost, 'setting up an n8n automation workflow with a webhook trigger').join('\n')).theme);

// ─── endpoint wiring ──────────────────────────────────────────────────────────────────────────
// The actions have to stay on the shared function: the project is at the Vercel Hobby 12-function
// ceiling, so a new api/*.ts file would break the deploy rather than this test.

const endpoint = readFileSync(new URL('../../api/agent-generate.ts', import.meta.url), 'utf8');
for (const action of ['parse-x-post', 'x-subtitles', 'x-post-deck']) {
  t(`endpoint · handles action '${action}'`, endpoint.includes(`action === '${action}'`));
}
t('endpoint · the fetcher is imported dynamically, not at module load', /await import\('\.\.\/src\/server\/xPostFetcher\.js'\)/.test(endpoint));
t('endpoint · the subtitle module is imported dynamically', /await import\('\.\.\/src\/server\/xSubtitles\.js'\)/.test(endpoint));
t('endpoint · the deck agent is imported dynamically', /await import\('\.\.\/src\/server\/agents\/xPostAgent\.js'\)/.test(endpoint));
t("endpoint · 'x-subtitles' 503s when the engine is unconfigured", /x-subtitles[\s\S]{0,900}not_configured/.test(endpoint));
t("endpoint · 'x-post-deck' 503s when the engine is unconfigured", /x-post-deck[\s\S]{0,900}not_configured/.test(endpoint));
t('endpoint · the video url is re-validated server-side before it is fetched', /x-subtitles[\s\S]{0,1200}isXVideoUrl\(videoUrl\)/.test(endpoint));
t('endpoint · slide images must already be relay-proxied', /x-post-deck[\s\S]{0,3000}mrdaniel\.co\.il\/api\/img-proxy\?url=/.test(endpoint));
t("endpoint · 'parse-x-post' runs the import through the security guard", /parse-x-post[\s\S]{0,1800}sanitizeOutput\(post\.text/.test(endpoint));
t("endpoint · 'x-subtitles' runs the transcript through the security guard", /sanitizeOutput\(track\.transcript/.test(endpoint));
t('endpoint · the clip length ceiling is enforced before the model call', /MAX_VIDEO_SECONDS/.test(endpoint));

// Every `src/` relative import inside an api/ module needs an explicit `.js`, or the whole function
// 500s at cold start on Vercel (see the OpenHiggsfield postmortem in AGENTS.md).
const xImports = [
  ...readFileSync(new URL('../../src/server/xPostFetcher.ts', import.meta.url), 'utf8').matchAll(/from '(\.[^']+)'/g),
  ...readFileSync(new URL('../../src/server/xSubtitles.ts', import.meta.url), 'utf8').matchAll(/from '(\.[^']+)'/g),
  ...readFileSync(new URL('../../src/server/agents/xPostAgent.ts', import.meta.url), 'utf8').matchAll(/from '(\.[^']+)'/g),
].map((m) => m[1]);
t('modules · every relative import carries an explicit .js', xImports.every((i) => i.endsWith('.js')), xImports.filter((i) => !i.endsWith('.js')).join(', '));

const vercelJson = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
const apiRoutes = new Set(vercelJson.rewrites.map((r) => r.destination.split('?')[0]).filter((d) => d.startsWith('/api/')));
t('deploy · no new Vercel Function was added for this feature', !apiRoutes.has('/api/parse-x-post') && !apiRoutes.has('/api/x-subtitles'), [...apiRoutes].join(', '));
t('deploy · the project is still under the 12-function Hobby ceiling', apiRoutes.size <= 12, String(apiRoutes.size));
t('deploy · the shared function still has headroom over the transcription call', (vercelJson.functions?.['api/agent-generate.ts']?.maxDuration ?? 0) >= 120, JSON.stringify(vercelJson.functions?.['api/agent-generate.ts']));
t('deploy · the burn-in limit is a client concern, so the clip ceiling is the server\'s only one', MAX_VIDEO_SECONDS === 600, String(MAX_VIDEO_SECONDS));

// ─── dashboard wiring ─────────────────────────────────────────────────────────────────────────

const app = readFileSync(new URL('../../dashboard/src/App.tsx', import.meta.url), 'utf8');
t('dashboard · the tab is registered', /id: 'x-import'/.test(app));
t('dashboard · the tab sits in the content-creation group', /id: 'x-import'[^}]*group: 'create'/.test(app));
t('dashboard · the tab is part of the Tab union', /'x-import'/.test(app.split('type Tab =')[1]?.split('\n')[0] ?? ''), app.split('type Tab =')[1]?.split('\n')[0]);
t('dashboard · the panel is wrapped in an ErrorBoundary', /tab === 'x-import'[\s\S]{0,200}<ErrorBoundary[\s\S]{0,120}<XImporter \/>/.test(app));

const client = readFileSync(new URL('../../dashboard/src/lib/xImportApi.ts', import.meta.url), 'utf8');
t('dashboard · deck synthesis never throws (it falls back locally)', /catch \(e\)[\s\S]{0,120}buildFallbackDeck/.test(client));
t('dashboard · the subtitle call gets its own long timeout', /180000/.test(client));
t('dashboard · the client agrees with the server on the source floor', /MIN_X_CHARS = 60/.test(client));
t('dashboard · the client agrees with the server on the clip ceiling', /MAX_VIDEO_SECONDS = 600/.test(client));

const burner = readFileSync(new URL('../../dashboard/src/lib/xSubtitleBurner.ts', import.meta.url), 'utf8');
t('burner · encodes through the same mp4-muxer pipeline as the Motion Studio', /from 'mp4-muxer'/.test(burner));
t('burner · warms the Hebrew faces before the first frame', /ensureDeckFonts/.test(burner));
t('burner · sets RTL direction on the caption canvas', /ctx\.direction = 'rtl'/.test(burner));
t('burner · times frames from mediaTime, not from the capture rate', /meta\.mediaTime \* 1e6/.test(burner));

for (const [state, label, detail] of results) console.log(`${state} ${label}${detail ? ` — ${detail}` : ''}`);
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
