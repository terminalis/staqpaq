#!/usr/bin/env node
// test-import — headless dev/CI test for the staqpaq.yaml round-trip. The
// contract under test: import(export(S)) === S for app-produced files (byte-
// identical re-export), and hand-edited files converge to the nearest valid
// state with an explicit dropped-paths report — never a throw, never a guess.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { serializeYaml } from '../src/core/export/serializeYaml.js';
import { parseStaqpaqYaml } from '../src/core/import/parseStaqpaqYaml.js';
import { flattenSpecTree } from '../src/core/import/flattenSpecTree.js';
import { normalizeSelections } from '../src/core/selections/normalizeSelections.js';
import { importDraft } from '../src/core/capabilities/importDraft.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const J = (n) => JSON.parse(readFileSync(join(ROOT, 'data', n), 'utf8'));
const catalogueJson = J('catalogue.json');
const derivation = J('derivation.json');
const sample = J('sample.json').selections;

const fieldByPath = new Map();
const allFields = [];
for (const s of catalogueJson.sections) {
  for (const f of s.fields || []) {
    fieldByPath.set(f.path, f);
    allFields.push(f);
  }
}
const catalogue = {
  sections: catalogueJson.sections,
  allFields,
  derivation,
  getField: (p) => fieldByPath.get(p) || null,
};

let pass = 0;
const failures = [];
const check = (n, c) => (c ? pass++ : failures.push(n));

// helper: full import pipeline over a yaml string
function importYaml(text) {
  const parsed = parseStaqpaqYaml(text);
  if (parsed.error) return { error: parsed.error };
  const flat = flattenSpecTree(parsed.tree, catalogue);
  return { selections: normalizeSelections(flat.selections, catalogue), dropped: flat.dropped_paths };
}

// --- round-trip: app-produced files come back byte-identical -----------------
const normalSample = normalizeSelections(sample, catalogue);
const yaml = serializeYaml(normalSample, catalogue);
const roundTrip = importYaml(yaml);
check('sample round-trip has no parse error', !roundTrip.error);
check('sample round-trip drops nothing', roundTrip.dropped && roundTrip.dropped.length === 0);
check('sample round-trip re-exports byte-identical yaml',
  serializeYaml(roundTrip.selections, catalogue) === yaml);
// .dismissed sidecars and status_only fields never export, so they cannot
// round-trip — everything else must come back exactly.
const statusOnlyPaths = new Set(allFields.filter((f) => f.status_only).map((f) => f.path));
const expectRoundTrip = Object.keys(normalSample).sort().filter((k) => {
  const base = k.endsWith('.custom') ? k.slice(0, -7) : k;
  return !k.endsWith('.dismissed') && !statusOnlyPaths.has(base);
});
check('sample round-trip reproduces the normalized selections map',
  JSON.stringify(Object.keys(roundTrip.selections).sort().map((k) => [k, roundTrip.selections[k]]))
    === JSON.stringify(expectRoundTrip.map((k) => [k, normalSample[k]])));

// --- custom-value mapping -----------------------------------------------------
const customSingle = importYaml('database:\n  provider: Convex\n');
check('custom single_select maps free text to <path>.custom',
  customSingle.selections['database.provider.custom'] === 'Convex'
  && customSingle.selections['database.provider'] === undefined);

const customMulti = importYaml('business:\n  fulfilment: [api_access, White-glove, Concierge]\n');
check('custom multi_select splits curated keys from free text',
  JSON.stringify(customMulti.selections['business.fulfilment.custom']) === JSON.stringify(['White-glove', 'Concierge'])
  && customMulti.selections['business.fulfilment'].includes('api_access'));
check('custom multi_select re-adds the other sentinel via normalize',
  customMulti.selections['business.fulfilment'].includes('other'));
check('custom multi re-exports byte-identical',
  serializeYaml(customMulti.selections, catalogue) === 'business:\n  fulfilment: [api_access, White-glove, Concierge]\n');

// quoted free text with escapes survives the trip
const quoted = normalizeSelections({ 'project.name': 'Acme "Analytics" \\ Co' }, catalogue);
const quotedYaml = serializeYaml(quoted, catalogue);
const quotedBack = importYaml(quotedYaml);
check('quoted scalar with escapes round-trips',
  quotedBack.selections['project.name'] === 'Acme "Analytics" \\ Co');

// --- normalize-then-adopt: unknown / conflicting input --------------------------
const unknown = importYaml('project:\n  name: Tiny\n  bogus_field: nope\nnot_a_section:\n  x: 1\n');
check('unknown paths drop with a report',
  unknown.selections['project.name'] === 'Tiny'
  && unknown.dropped.includes('project.bogus_field')
  && unknown.dropped.includes('not_a_section.x'));

const unknownMember = importYaml('project:\n  platforms: [web, hologram]\n');
check('unknown option keys in lists drop per-member (no custom hatch)',
  JSON.stringify(unknownMember.selections['project.platforms']) === JSON.stringify(['web'])
  && unknownMember.dropped.some((d) => d.includes('hologram')));

const conflicted = importYaml('ai:\n  features: [none]\n  providers: [openai]\n');
check('gated combinations sweep on import (ai none rules out providers)',
  JSON.stringify(conflicted.selections['ai.features']) === JSON.stringify(['none'])
  && conflicted.selections['ai.providers'] === undefined);

// --- stack-profile round-trip -----------------------------------------------------
const profileSel = normalizeSelections(
  { 'meta.kind': 'profile', 'frontend.framework': 'react', 'database.provider': 'supabase' },
  catalogue,
);
const profileYaml = serializeYaml(profileSel, catalogue);
check('profile yaml self-describes its kind', /(^|\n)meta:\n {2}kind: profile\n/.test(profileYaml));
const profBack = importYaml(profileYaml);
check('profile round-trip re-exports byte-identical',
  serializeYaml(profBack.selections, catalogue) === profileYaml);
const mixed = importYaml('meta:\n  kind: profile\nproject:\n  name: My Stack\n  type: saas\nfrontend:\n  framework: react\n');
check('project-only content sweeps when importing a profile (but the stack name survives)',
  mixed.selections['project.type'] === undefined
  && mixed.selections['project.name'] === 'My Stack'
  && mixed.selections['frontend.framework'] === 'react');

// --- hostile / malformed input --------------------------------------------------
delete Object.prototype.staqpaqPolluted;
const proto = parseStaqpaqYaml('__proto__:\n  staqpaqPolluted: yes\n');
check('__proto__ keys are rejected', !!proto.error && Object.prototype.staqpaqPolluted === undefined);
delete Object.prototype.staqpaqPolluted;

check('oversize input is rejected', !!parseStaqpaqYaml('a: b\n'.repeat(90000)).error);
check('tabs are rejected with a line number', parseStaqpaqYaml('project:\n\tname: x\n').error?.line === 2);
check('duplicate keys are rejected', parseStaqpaqYaml('project:\n  name: a\n  name: b\n').error?.line === 3);
check('block lists are rejected', !!parseStaqpaqYaml('project:\n  platforms:\n    - web\n').error);
check('odd indentation is rejected', parseStaqpaqYaml('project:\n   name: x\n').error?.line === 2);
check('empty map headers are rejected', !!parseStaqpaqYaml('project:\n').error);
check('unterminated quotes are rejected', !!parseStaqpaqYaml('project:\n  name: "abc\n').error);

// --- the capability itself -------------------------------------------------------
const ctx = { catalogue, draft: { selections: {} } };
const ok = importDraft(ctx, { text: yaml, file_name: 'sample_staqpaq.yaml' });
check('importDraft adopts and reports counts',
  ok.selections && ok.output.imported === true && ok.output.selection_count > 0
  && ok.output.dropped_paths.length === 0);
check('importDraft emits draft_imported with the file name',
  ok.events[0].name === 'draft_imported' && ok.events[0].payload.file_name === 'sample_staqpaq.yaml');
check('importDraft rejects an empty file',
  importDraft(ctx, { text: '   \n' }).error?.code === 'INVALID_YAML');
check('importDraft reports parse errors with line numbers',
  importDraft(ctx, { text: 'project:\n\tname: x\n' }).error?.line === 2);
check('importDraft never throws on garbage input',
  !!importDraft(ctx, { text: 42 }).error);

if (failures.length) {
  console.error(`✗ test-import FAILED — ${failures.length} of ${pass + failures.length}:`);
  for (const f of failures) console.error('    - ' + f);
  process.exit(1);
}
console.log(`✓ test-import passed — ${pass} checks (round-trip, custom mapping, normalize-then-adopt, hostile input)`);
