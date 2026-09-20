// The template registry: does a deck map onto real Figma node ids, and does the single-block
// composition match what the template actually expects?
//
// Everything here is offline. The node ids were read from the live file once; these cases guard the
// mapping logic around them, not Figma itself.
// Run: npx tsx scripts/__tests__/figma-templates.test.mjs
import {
  HUMAN_DELUXE,
  DEFAULT_TEMPLATE_ID,
  getTemplate,
  listTemplates,
  pickFrame,
  composeSingleBlock,
  planDeck,
} from '../../src/agent/figmaTemplates.ts';
import { enforceDeck } from '../../src/agent/storyCarousel.ts';

const results = [];
const t = (label, cond, detail = '') => results.push([cond ? 'PASS' : 'FAIL', label, cond ? '' : detail]);

// Registry basics.
t('default template resolves', getTemplate().id === DEFAULT_TEMPLATE_ID);
t('explicit id resolves', getTemplate('human-deluxe').id === 'human-deluxe');
t('listTemplates exposes the default', listTemplates().some((x) => x.id === DEFAULT_TEMPLATE_ID));
let unknownThrew = '';
try { getTemplate('does-not-exist'); } catch (e) { unknownThrew = e.message; }
t('unknown id throws, naming the valid ones', /unknown figma template/.test(unknownThrew) && /human-deluxe/.test(unknownThrew), unknownThrew);

// Every registered node id must look like a Figma id, and no frame may reuse another's text node —
// a duplicate would make two slides overwrite each other and the bug would only show in the render.
const allFrames = Object.values(HUMAN_DELUXE.frames).flat();
t('every frameId is a figma id', allFrames.every((f) => /^\d+:\d+$/.test(f.frameId)), JSON.stringify(allFrames.find((f) => !/^\d+:\d+$/.test(f.frameId))));
const textIds = allFrames.map((f) => f.textNodeId).filter(Boolean);
t('no text node is shared between frames', new Set(textIds).size === textIds.length, `${textIds.length} ids, ${new Set(textIds).size} unique`);
const frameIds = allFrames.map((f) => f.frameId);
t('no frame is registered twice', new Set(frameIds).size === frameIds.length);
t('text-bearing frames carry all three meta nodes', allFrames.filter((f) => f.textNodeId).every((f) => f.handle && f.hashtag && f.year));
t('the image frame has no text node', HUMAN_DELUXE.frames.image[0].textNodeId === null);
t('every deck role maps to a populated archetype', Object.values(HUMAN_DELUXE.roleFrames).every((a) => HUMAN_DELUXE.frames[a]?.length > 0));

// Composition: the template has ONE text block, so the fields flatten into it with blank lines.
const slide = { index: 2, role: 'item', title: 'BragJack', subtitle: 'חטיפת סוכני AI', bodyLines: ['שורה ראשונה.', 'שורה שנייה.'] };
const block = composeSingleBlock(slide);
t('single block joins parts with a blank line', block === 'BragJack\n\nחטיפת סוכני AI\n\nשורה ראשונה.\nשורה שנייה.', JSON.stringify(block));
t('body lines keep single newlines between them', (block.match(/\n\n/g) || []).length === 2, JSON.stringify(block));
const coverBlock = composeSingleBlock({ index: 1, role: 'cover', title: 'כותרת', subtitle: '', bodyLines: ['א.', 'ב.'] });
t('an empty subtitle leaves no double gap', !coverBlock.includes('\n\n\n') && coverBlock === 'כותרת\n\nא.\nב.', JSON.stringify(coverBlock));

// Variant rotation must be deterministic — a re-render has to look identical.
const s1 = { index: 2, role: 'item', title: 'a', subtitle: 'b', bodyLines: ['c'] };
const s2 = { index: 3, role: 'item', title: 'a', subtitle: 'b', bodyLines: ['c'] };
t('variant rotation is deterministic', pickFrame(HUMAN_DELUXE, s1).frameId === pickFrame(HUMAN_DELUXE, s1).frameId);
t('consecutive slides get different variants', pickFrame(HUMAN_DELUXE, s1).frameId !== pickFrame(HUMAN_DELUXE, s2).frameId);
t('cover uses the long-title archetype', HUMAN_DELUXE.frames.longTitle.some((f) => f.frameId === pickFrame(HUMAN_DELUXE, { index: 1, role: 'cover' }).frameId));
t('cta uses the cta archetype', HUMAN_DELUXE.frames.cta.some((f) => f.frameId === pickFrame(HUMAN_DELUXE, { index: 6, role: 'cta' }).frameId));

// End to end: a deck becomes a write plan of node ids.
const deck = enforceDeck({
  slides: [
    { role: 'cover', title: 'כותרת שער', bodyLines: ['שורה א.', 'שורה ב.'] },
    { role: 'item', title: 'BragJack', subtitle: 'חטיפת סוכנים', bodyLines: ['פרט אחד.', 'פרט שני.'] },
    { role: 'cta', title: 'עקבו', bodyLines: ['שמרו את הפוסט.', 'עקבו לעוד.'] },
  ],
});
const plan = planDeck(deck, 'human-deluxe');
t('plan covers every slide', plan.slides.length === 3);
t('plan reports the template', plan.template.id === 'human-deluxe');
t('every entry targets a nodeId, never a name', plan.slides.every((s) => s.entries.every((e) => /^\d+:\d+$/.test(e.nodeId) && !('name' in e))), JSON.stringify(plan.slides[0].entries[0]));
t('each slide writes content plus three meta nodes', plan.slides.every((s) => s.entries.length === 4), JSON.stringify(plan.slides.map((s) => s.entries.length)));
t('template placeholders are overwritten', plan.slides.every((s) => s.entries.some((e) => e.text === HUMAN_DELUXE.meta.handle)));
t('no placeholder text survives', !JSON.stringify(plan.slides).includes('your_username') && !JSON.stringify(plan.slides).includes('DesignEveryDay'));
const contentTexts = plan.slides.map((s) => s.entries[0].text);
t('cover content is the composed block', contentTexts[0].startsWith('כותרת שער\n\n'), JSON.stringify(contentTexts[0]));
t('item content carries the subtitle block', contentTexts[1].includes('\n\nחטיפת סוכנים\n\n'), JSON.stringify(contentTexts[1]));
t('slides target distinct frames', new Set(plan.slides.map((s) => s.frameId)).size === 3);

for (const [state, label, detail] of results) console.log(`${state} ${label}${detail ? ` — ${detail}` : ''}`);
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
