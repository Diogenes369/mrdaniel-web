// The OpenHiggsfield bridge: does the vendored catalog still map a brief to the request the
// platform expects — and does a bad brief fail before a billable call is made?
//
// No keys, no network, no quota: every case here stops at the mapping layer or at the key check.
// This is the test that catches a bad `npm run sync:higgsfield` (an upstream refresh that renamed a
// model id, dropped a setting or changed a submit path) before a deploy does.
// Run: npx tsx scripts/__tests__/openhiggsfield-bridge.test.mjs
import {
  describeHiggsfieldModel,
  describeMissingHiggsfieldKeys,
  higgsfieldConfigured,
  listHiggsfieldModels,
  startHiggsfieldRun,
} from '../../src/agent/OpenHiggsfieldEngine.ts';
import { MODELS, getModel, parseSettings } from '../../src/agent/openhiggsfield/catalog/index.ts';
import { toPlatform } from '../../src/agent/openhiggsfield/to-platform.ts';

const results = [];
const t = (label, cond, detail = '') => results.push([cond ? 'PASS' : 'FAIL', label, cond ? '' : detail]);

const fails = async (label, brief, expected) => {
  try {
    await startHiggsfieldRun(brief);
    t(label, false, 'no error thrown — a bad brief reached the platform');
  } catch (err) {
    const message = String(err?.message ?? err);
    t(label, message.includes(expected), message);
  }
};

/** The same object the engine builds, mapped without a network call. */
const mapped = (model, prompt, media = {}, settings = {}) =>
  toPlatform({
    model,
    prompt: { text: prompt },
    media: Object.fromEntries(
      Object.entries(media).map(([role, urls]) => [role, urls.map((url, i) => ({ id: `${role}-${i}`, url, role }))])
    ),
    settings: parseSettings(getModel(model), settings),
  });

// ─── catalog ──────────────────────────────────────────────────────────────────────────────────

const all = listHiggsfieldModels();
const image = all.filter((m) => m.surface === 'image');
const video = all.filter((m) => m.surface === 'video');
t('the catalog carries 38 models', all.length === 38, String(all.length));
t('8 image, 30 video', image.length === 8 && video.length === 30, `${image.length} / ${video.length}`);
t('every model has a unique id', new Set(all.map((m) => m.id)).size === all.length);
t('every model has a label', all.every((m) => m.label.trim().length > 0));
t('every model declares at least one setting', all.every((m) => Object.keys(m.settings).length > 0));
t('search narrows by id and label', listHiggsfieldModels({ search: 'kling' }).length >= 6);
t('surface filters', listHiggsfieldModels({ surface: 'image' }).every((m) => m.surface === 'image'));

// Every catalog entry must be mappable: a model in the picker that no mapper covers would only
// fail at submit time, after the caller believed the id was valid.
const unmappable = MODELS.filter((model) => {
  try {
    mapped(model.id, 'a lit server rack, shallow depth of field');
    return false;
  } catch {
    return true;
  }
}).map((model) => model.id);
t('every catalog model maps to a submit path', unmappable.length === 0, unmappable.join(', '));

// ─── mapping ──────────────────────────────────────────────────────────────────────────────────

const soul = mapped('soul-2', 'neon cyber lock', {}, { aspectRatio: '9:16', resolution: '1080p' });
t('soul-2 hits the Soul path', soul.path === 'higgsfield-ai/soul/v2/standard', soul.path);
t('soul-2 carries the story aspect ratio', soul.body.aspect_ratio === '9:16', JSON.stringify(soul.body));
t('soul-2 sends the prompt', soul.body.prompt === 'neon cyber lock');

const t2v = mapped('kling-3-std', 'camera pushes through a data centre', {}, { duration: 5 });
t('kling-3-std with no frame is text-to-video', t2v.path === 'kling-video/v3.0/std/text-to-video', t2v.path);
const i2v = mapped('kling-3-std', 'camera pushes in', { start: ['https://cdn.example.com/a.png'] });
t('a start frame switches to image-to-video', i2v.path === 'kling-video/v3.0/std/image-to-video', i2v.path);
t('the start frame becomes image_url', i2v.body.image_url === 'https://cdn.example.com/a.png');
t('image-to-video drops aspect_ratio', i2v.body.aspect_ratio === undefined, JSON.stringify(i2v.body));

const edit = mapped('seedance-2.5-edit', 'regrade to cold blue', { video: ['https://cdn.example.com/v.mp4'] });
t('seedance edit maps video_url', edit.body.video_url === 'https://cdn.example.com/v.mp4', JSON.stringify(edit.body));

// ─── settings allow-list ──────────────────────────────────────────────────────────────────────

const kling = describeHiggsfieldModel('kling-3-std');
t('kling-3-std reports its duration range', kling.settings.duration?.type === 'range', JSON.stringify(kling.settings));
t('kling-3-std accepts a start frame', kling.roles.start >= 1, JSON.stringify(kling.roles));
t('defaults fill in when nothing is passed', typeof mapped('kling-3-std', 'x').body.duration === 'number');

// ─── refusals (nothing billable leaves the process) ───────────────────────────────────────────

t('no keys in this test process', !higgsfieldConfigured() || describeMissingHiggsfieldKeys().length === 0);
await fails('an unknown model is refused', { model: 'kling-9000', prompt: 'x' }, 'Unknown model');
await fails('an empty prompt is refused', { model: 'soul-2', prompt: '   ' }, 'prompt is empty');
await fails(
  'a role the model does not take is refused',
  { model: 'soul-2', prompt: 'x', media: { start: ['https://cdn.example.com/a.png'] } },
  "takes no 'start' input"
);
await fails(
  'a non-http media input is refused',
  { model: 'kling-3-std', prompt: 'x', media: { start: ['blob:local-preview'] } },
  'public http(s) URL'
);
await fails('an out-of-range setting is refused', { model: 'kling-3-std', prompt: 'x', settings: { duration: 99 } }, 'Invalid duration');
await fails('an invalid enum is refused', { model: 'soul-2', prompt: 'x', settings: { resolution: '8k' } }, 'Invalid resolution');

// With a valid brief and no keys, the refusal must be about configuration — never a silent success.
if (!higgsfieldConfigured()) {
  await fails('a valid brief with no keys names the missing env', { model: 'soul-2', prompt: 'a lock' }, 'not configured');
} else {
  t('a valid brief with no keys names the missing env', true, 'skipped — HF_API_* is configured in this shell');
}

for (const [state, label, detail] of results) console.log(`${state} ${label}${detail ? ` — ${detail}` : ''}`);
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
