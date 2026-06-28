#!/usr/bin/env node
// test-export — headless dev/CI test for Step 8 serialization (the pure parts;
// the fflate zip determinism + full pack run in the browser). Checks the
// staqpaq.yaml structural constraints, determinism, asset-status/readiness
// exclusion, and the companion-file generators.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { serializeYaml, buildSpecTree } from '../src/core/export/serializeYaml.js';
import { staqpaqMd, assetChecklistMd, missingDecisionsMd, envExample, projectName } from '../src/core/export/artifacts.js';
import { deriveRequirements } from '../src/core/derive/deriveRequirements.js';
const normalizationModule = await import('../src/core/selections/normalizeSelections.js').catch(() => null);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const J = (n) => JSON.parse(readFileSync(join(ROOT, 'data', n), 'utf8'));
const catalogueJson = J('catalogue.json');
const derivation = J('derivation.json');
const sample = J('sample.json').selections;

const allFields = [];
for (const s of catalogueJson.sections) for (const f of s.fields || []) allFields.push(f);
const catalogue = { sections: catalogueJson.sections, allFields, derivation };

let pass = 0;
const failures = [];
const check = (n, c) => (c ? pass++ : failures.push(n));

const yaml = serializeYaml(sample, catalogue);

// structural constraints
check('starts at project:', yaml.startsWith('project:\n'));
check('includes project name', /\n {2}name: Acme Analytics\n/.test(yaml));
check('includes type', /\n {2}type: saas\n/.test(yaml));
check('platforms nested under project', /\n {2}platforms: \[web, ios\]\n/.test(yaml));
check('nested database.provider', /\ndatabase:\n {2}provider: supabase\n/.test(yaml));
// no product field is a boolean anymore (cookie consent moved to surface.policy_pages);
// cover boolean serialization against a synthetic one-field catalogue
check('boolean true serialized', /flags:\n {2}test: true/.test(serializeYaml({ 'flags.test': true }, { allFields: [{ path: 'flags.test', kind: 'boolean' }] })));
check('policy_pages multi serialized', /\n {2}policy_pages: \[cookie_consent_banner, privacy_policy, terms_of_service\]/.test(yaml));
check('color value quoted (#)', /theme:\n {4}color: "#3057e1"/.test(yaml));
// exclusions — the brand checklist (assets.have) is status_only, so it never serializes even
// though the assets: namespace now exists for the exported stock-provider field
check('brand checklist (status_only) excluded from yaml', !/brand_checklist:/.test(yaml));
check('stock assets exported under assets:', /assets:/.test(yaml) && /stock:/.test(yaml));
check('NO readiness/missing/metadata', !/readiness/.test(yaml) && !/missing/.test(yaml) && !/version:/.test(yaml));
// determinism
check('yaml deterministic', serializeYaml(sample, catalogue) === yaml);
check('yaml deterministic (rebuilt selections)', serializeYaml(JSON.parse(JSON.stringify(sample)), catalogue) === yaml);
// empty draft → empty yaml (export never blocked)
check('empty draft → empty yaml', serializeYaml({}, catalogue) === '');
// sparse spec → minimal valid pack
check('sparse spec exports', serializeYaml({ 'project.name': 'Tiny' }, catalogue) === 'project:\n  name: Tiny\n');
// custom value exports at the field path
check('custom value at path', serializeYaml({ 'database.provider.custom': 'Convex' }, catalogue) === 'database:\n  provider: Convex\n');
// custom multi_select merges picked keys + free text (the bare "other" sentinel is dropped)
check('custom multi_select merges keys + free text', serializeYaml({ 'business.fulfilment': ['api_access', 'other'], 'business.fulfilment.custom': 'White-glove' }, catalogue) === 'business:\n  fulfilment: [api_access, White-glove]\n');
// MORE THAN ONE free-text Other (array) — each is emitted after the picked keys
check('custom multi_select emits multiple Others', serializeYaml({ 'business.fulfilment': ['api_access', 'other'], 'business.fulfilment.custom': ['White-glove', 'Concierge'] }, catalogue) === 'business:\n  fulfilment: [api_access, White-glove, Concierge]\n');
check('target users Other exports custom audience text', serializeYaml({ 'project.audience': ['internal', 'other'], 'project.audience.custom': 'Field technicians' }, catalogue) === 'project:\n  audience: [internal, Field technicians]\n');
// the ".dismissed" suggestion-memory sidecar never reaches the canonical yaml
check('dismissed sidecar excluded from yaml', serializeYaml({ 'surface.screens': ['dashboard'], 'surface.screens.dismissed': ['billing'] }, catalogue) === 'surface:\n  screens: [dashboard]\n');

// companion artifacts
const derived = deriveRequirements(sample, catalogue);
const name = projectName(sample);
const env = envExample(derived.implied_env_vars, name);
check('.env from selected providers', /SUPABASE_URL=/.test(env) && /STRIPE_SECRET_KEY=/.test(env));
check('.env uses Supabase publishable key', /SUPABASE_PUBLISHABLE_KEY=/.test(env) && !/SUPABASE_ANON_KEY=/.test(env));
check('.env grouped by provider', /# Supabase\n/.test(env));
check('.env notes it is a pack output', /not staqpaq's own runtime/.test(env));
const checklist = assetChecklistMd(derived.required_assets, name);
check('asset checklist lists logo + favicon', /logo\.svg/.test(checklist) && /favicon\.ico/.test(checklist));
// brand checklist drives have/need: sample has assets.brand_checklist:["logo"], so logo is [x], favicon [ ]
check('asset checklist marks have/need from brand checklist', /\[x\][^\n]*logo\.svg/.test(checklist) && /\[ \][^\n]*favicon\.ico/.test(checklist));
const md = staqpaqMd(buildSpecTree(sample, catalogue), name);
check('staqpaq.md header + section', /# Acme Analytics/.test(md) && /## Project/.test(md));
check('staqpaq.md one-way note', /generated one-way/i.test(md));
const missing = missingDecisionsMd(derived.missing_decisions, name);
check('missing-decisions.md renders', /Missing decisions/.test(missing));

// hardening regressions: companion files must not let catalogue/user text create
// extra Markdown headings, list items, or env assignments.
const injectedEnv = envExample(
  [{ key: 'SAFE_KEY', from_provider: 'Provider\nEXTRA_ENV=1' }],
  'Unsafe\nPROJECT_SECRET=1',
);
check('.env comments collapse injected newlines', !/\nPROJECT_SECRET=1/.test(injectedEnv) && !/\nEXTRA_ENV=1/.test(injectedEnv));
check('.env still renders safe key', /\nSAFE_KEY=\n/.test(injectedEnv));

const injectedMarkdown = staqpaqMd({ project: { name: 'Acme\n## Injected section' } }, 'Name\n## Hacked');
check('staqpaq.md escapes injected heading text', !/^## Hacked$/m.test(injectedMarkdown) && !/^## Injected section$/m.test(injectedMarkdown));

const injectedChecklist = assetChecklistMd(
  [{ have: false, label: 'Logo\n- [x] forged item', filename_hint: 'logo.svg`\n- [x] forged file' }],
  'Brand\n# Forged heading',
);
check('asset checklist escapes injected markdown structure', !/^# Forged heading$/m.test(injectedChecklist) && !/^- \[x\] forged item$/m.test(injectedChecklist));

// stale persisted drafts should be normalised before export/hydration: invalid
// option keys, wrong value shapes, and unknown paths are dropped.
const normalise = normalizationModule && normalizationModule.normalizeSelections;
check('normalizeSelections helper exists', typeof normalise === 'function');
const staleSelections = typeof normalise === 'function' ? normalise({
  'project.name': ['not a string'],
  'project.platforms': ['web', 'bogus_platform'],
  'database.provider': 'bogus_provider',
  'surface.screens.dismissed': ['billing', 42],
  'no.such.path': 'value',
}, catalogue) : {};
const staleYaml = serializeYaml(staleSelections, catalogue);
check('normalizeSelections drops stale invalid values before export',
  /project:\n {2}platforms: \[web\]\n/.test(staleYaml) &&
  !/bogus_/.test(staleYaml) &&
  !/not a string/.test(staleYaml) &&
  Array.isArray(staleSelections['surface.screens.dismissed']) &&
  staleSelections['surface.screens.dismissed'].length === 1);

const removedSelections = typeof normalise === 'function' ? normalise({
  'project.type': 'ai_app',
  'project.audience': ['agencies', 'internal', 'enterprises'],
  'content.cms': 'sanity',
  'content.cms.custom': 'Ghost',
  'support.docs': 'gitbook',
}, catalogue) : {};
const removedYaml = serializeYaml(removedSelections, catalogue);
check('normalizeSelections drops removed options and content.cms before export',
  removedSelections['project.type'] === undefined &&
  JSON.stringify(removedSelections['project.audience']) === JSON.stringify(['agencies', 'internal']) &&
  removedSelections['content.cms'] === undefined &&
  removedSelections['content.cms.custom'] === undefined &&
  /project:\n {2}audience: \[agencies, internal\]/.test(removedYaml) &&
  /support:\n {2}docs: gitbook/.test(removedYaml) &&
  !/content:\n {2}cms:/.test(removedYaml));

const migratedSelections = typeof normalise === 'function' ? normalise({
  'content.docs': 'gitbook',
  'design.icons.ui': 'lucide',
  'frontend.component_library': 'nativebase',
  'frontend.framework': 'expo',
  'notifications.sms': 'messagebird',
  'database.provider': 'custom',
}, catalogue) : {};
const migratedFramework = typeof normalise === 'function' ? normalise({
  'frontend.framework': 'remix',
}, catalogue) : {};
check('normalizeSelections maps renamed fields and options',
  migratedSelections['support.docs'] === 'gitbook' &&
  migratedSelections['design.icons'] === 'lucide' &&
  migratedSelections['frontend.component_library'] === 'gluestack' &&
  migratedSelections['frontend.framework'] === 'expo' &&
  migratedFramework['frontend.framework'] === 'react_router' &&
  migratedSelections['notifications.sms'] === 'bird' &&
  migratedSelections['database.provider'] === 'other');
const migratedYaml = serializeYaml(migratedSelections, catalogue);
check('renamed docs export under support.docs',
  /support:\n {2}docs: gitbook/.test(migratedYaml) &&
  !/content:\n {2}docs:/.test(migratedYaml));

// Defensive serializer path guard: an unsafe catalogue path must not mutate
// Object.prototype even if a bad catalogue object is supplied directly.
delete Object.prototype.staqpaqPolluted;
const unsafeYaml = serializeYaml(
  { '__proto__.staqpaqPolluted': 'yes' },
  { allFields: [{ path: '__proto__.staqpaqPolluted', kind: 'text' }] },
);
check('unsafe field paths cannot pollute Object.prototype', unsafeYaml === '' && Object.prototype.staqpaqPolluted === undefined);
delete Object.prototype.staqpaqPolluted;

if (failures.length) {
  console.error(`✗ test-export FAILED — ${failures.length} of ${pass + failures.length}:`);
  for (const f of failures) console.error('    - ' + f);
  process.exit(1);
}
console.log(`✓ test-export passed — ${pass} checks (yaml structure, determinism, exclusions, companions)`);
