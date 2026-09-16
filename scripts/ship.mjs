#!/usr/bin/env node
/**
 * ship — the release checklist from AGENTS.md as one command.
 *
 *   npm run ship                     mirrors + tsc + build for site AND dashboard, no deploy
 *   npm run ship -- --scrapers       …plus the live Threads scraper regression watch
 *   npm run ship -- --deploy         …then `vercel --prod` for both projects
 *   npm run ship -- --deploy --only dashboard|site
 *
 * Every change in this repo ends with the same five commands in two directories, and the one that
 * gets skipped is the one that ships the bug (a dashboard build nobody ran, a mirror nobody synced).
 * Checks run in parallel per project; deploy is refused unless every check passed AND the working tree
 * is clean — a deploy of uncommitted code is a production state that exists in no commit.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DASH = path.join(ROOT, 'dashboard');
const args = process.argv.slice(2);
const DEPLOY = args.includes('--deploy');
const SCRAPERS = args.includes('--scrapers');
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const doSite = ONLY !== 'dashboard';
const doDash = ONLY !== 'site';

function run(label, cmd, cwd) {
  return new Promise((resolve) => {
    const started = Date.now();
    // shell:true so `npx` resolves to npx.cmd on Windows.
    const child = spawn(cmd, { cwd, shell: true, env: { ...process.env, FORCE_COLOR: '0' } });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', (code) => resolve({ label, ok: code === 0, secs: ((Date.now() - started) / 1000).toFixed(1), out }));
  });
}

async function chain(steps) {
  const results = [];
  for (const [label, cmd, cwd] of steps) {
    const r = await run(label, cmd, cwd);
    results.push(r);
    if (!r.ok) break;
  }
  return results;
}

const tracks = [chain([['mirrors', 'node scripts/check-mirrors.mjs', ROOT]])];
if (doSite) tracks.push(chain([['site tsc', 'npx tsc --noEmit', ROOT], ['site build', 'npm run build', ROOT]]));
if (doDash) tracks.push(chain([['dashboard tsc', 'npx tsc --noEmit', DASH], ['dashboard build', 'npm run build', DASH]]));
if (SCRAPERS) tracks.push(chain([['scrapers', 'npx tsx scripts/scraper-watch.ts', ROOT]]));

console.log(`ship: running ${tracks.length} track(s)…`);
const results = (await Promise.all(tracks)).flat();

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`  ${r.ok ? '✔' : '✘'} ${r.label.padEnd(16)} ${r.secs}s`);
for (const r of failed) {
  console.log(`\n── ${r.label} output (tail) ──`);
  console.log(r.out.trim().split('\n').slice(-40).join('\n'));
}
if (failed.length) process.exit(1);

if (!DEPLOY) {
  console.log('\nship: all checks passed. Re-run with --deploy to push to production.');
  process.exit(0);
}

const status = await run('git status', 'git status --porcelain', ROOT);
if (status.out.trim()) {
  console.log('\nship: refusing to deploy — the working tree has uncommitted changes:\n' + status.out);
  process.exit(1);
}

const deploys = [];
if (doSite) deploys.push(['deploy site', 'npx vercel --prod --yes', ROOT]);
if (doDash) deploys.push(['deploy dashboard', 'npx vercel --prod --yes', DASH]);
for (const [label, cmd, cwd] of deploys) {
  const r = await run(label, cmd, cwd);
  const url = r.out.match(/https:\/\/\S+\.vercel\.app/g)?.pop() ?? '';
  console.log(`  ${r.ok ? '✔' : '✘'} ${label.padEnd(16)} ${r.secs}s ${url}`);
  if (!r.ok) {
    console.log(r.out.trim().split('\n').slice(-30).join('\n'));
    process.exit(1);
  }
}
