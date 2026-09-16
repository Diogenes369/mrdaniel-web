#!/usr/bin/env node
/**
 * check-mirrors — catches drift between the hand-synced type mirrors.
 *
 * The site (`src/`) and the dashboard (`dashboard/src/`) are separate npm projects that cannot
 * import each other, so the shared contracts are copied by hand (AGENTS.md). tsc cannot see across
 * that boundary: add a `ToolBrand` on the server and forget the dashboard, and both projects still
 * typecheck — the dashboard just renders the new value as nothing. This script is the missing check.
 *
 * For every exported type alias or interface declared under the SAME NAME on both sides it compares:
 *   - string-literal unions → the set of literals
 *   - interfaces            → property names and whether each is optional
 * Anything declared on one side only is ignored (the dashboard legitimately mirrors a subset).
 *
 * Usage: node scripts/check-mirrors.mjs [--json]      exit 1 on drift
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Server source of truth → dashboard mirrors. Add a pair here when a new mirror file appears. */
const PAIRS = [
  { server: 'src/agent/types.ts', dashboard: ['dashboard/src/lib/techTipsApi.ts', 'dashboard/src/lib/agentTypes.ts'] },
  { server: 'src/server/igGrowthStrategy.ts', dashboard: ['dashboard/src/lib/igGrowthTypes.ts'] },
];

/** Differences that are deliberate. Key: `TypeName.member` (or `TypeName|literal`), value: why. */
const CLIENT_ENVELOPE = 'added by the dashboard API client when it wraps the server response (techTipsApi / igGrowthApi)';
const SERVER_ONLY = 'server-side bookkeeping the dashboard never reads';
const ALLOW = {
  'TechTipDeck.synthesized': CLIENT_ENVELOPE,
  'TechTipDeck.fallbackReason': CLIENT_ENVELOPE,
  'TechTipDeck.createdAt': CLIENT_ENVELOPE,
  'TechTipDeck.topic': 'attached by the Threads agent response envelope, typed dashboard-side only',
  'GrowthPack.synthesized': CLIENT_ENVELOPE,
  'GrowthPack.fallbackReason': CLIENT_ENVELOPE,
  'GrowthPack.createdAt': CLIENT_ENVELOPE,
  'AgentConfig.strategicContext': SERVER_ONLY,
  'VideoJob.providerState': SERVER_ONLY,
};

function shapes(rel) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) return new Map();
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const out = new Map();
  const exported = (n) => n.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  sf.forEachChild((node) => {
    if (ts.isTypeAliasDeclaration(node) && exported(node) && ts.isUnionTypeNode(node.type)) {
      const lits = node.type.types.filter((t) => ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal)).map((t) => t.literal.text);
      if (lits.length === node.type.types.length) out.set(node.name.text, { kind: 'union', members: new Set(lits), file: rel });
    }
    if (ts.isInterfaceDeclaration(node) && exported(node)) {
      const members = new Map();
      for (const m of node.members) {
        if (ts.isPropertySignature(m) && m.name && (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name))) {
          members.set(m.name.text, Boolean(m.questionToken));
        }
      }
      out.set(node.name.text, { kind: 'interface', members, file: rel });
    }
  });
  return out;
}

const problems = [];
for (const pair of PAIRS) {
  const server = shapes(pair.server);
  const dash = new Map();
  for (const rel of pair.dashboard) for (const [k, v] of shapes(rel)) dash.set(k, v);

  for (const [name, s] of server) {
    const d = dash.get(name);
    if (!d || d.kind !== s.kind) continue;
    const add = (detail, key) => {
      if (!ALLOW[key]) problems.push({ type: name, server: s.file, dashboard: d.file, detail });
    };
    if (s.kind === 'union') {
      for (const lit of s.members) if (!d.members.has(lit)) add(`'${lit}' missing in dashboard`, `${name}|${lit}`);
      for (const lit of d.members) if (!s.members.has(lit)) add(`'${lit}' missing on server`, `${name}|${lit}`);
    } else {
      for (const [prop, opt] of s.members) {
        if (!d.members.has(prop)) add(`property '${prop}' missing in dashboard`, `${name}.${prop}`);
        else if (d.members.get(prop) !== opt) add(`property '${prop}' is ${opt ? 'optional' : 'required'} on server, ${opt ? 'required' : 'optional'} in dashboard`, `${name}.${prop}`);
      }
      for (const prop of d.members.keys()) if (!s.members.has(prop)) add(`property '${prop}' missing on server`, `${name}.${prop}`);
    }
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ok: problems.length === 0, problems }, null, 2));
} else if (!problems.length) {
  console.log('mirrors: in sync');
} else {
  console.log(`mirrors: ${problems.length} drift(s)`);
  for (const p of problems) console.log(`  ${p.type}: ${p.detail}  (${p.server} ↔ ${p.dashboard})`);
}
process.exit(problems.length ? 1 : 0);
