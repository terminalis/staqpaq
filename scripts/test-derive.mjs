#!/usr/bin/env node
// test-derive — headless dev/CI test for Step 7 derive_requirements: determinism
// (identical input → byte-identical output), env-var / asset / implication
// derivation over the real sample fixture, custom-value opacity, and empty-draft
// readiness.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { deriveRequirements } from '../src/core/derive/deriveRequirements.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const J = (n) => JSON.parse(readFileSync(join(ROOT, 'data', n), 'utf8'));
const catalogueJson = J('catalogue.json');
const derivation = J('derivation.json');
const sample = J('sample.json');

const allFields = [];
for (const s of catalogueJson.sections) for (const f of s.fields || []) allFields.push(f);
const catalogue = { sections: catalogueJson.sections, allFields, derivation };

let pass = 0;
const failures = [];
const check = (n, c) => (c ? pass++ : failures.push(n));

const sel = sample.selections;
const out = deriveRequirements(sel, catalogue);

// 1 · determinism — identical input yields byte-identical output
const out2 = deriveRequirements(JSON.parse(JSON.stringify(sel)), catalogue);
check('deterministic (byte-identical)', JSON.stringify(out) === JSON.stringify(out2));

// 2 · env vars from selected providers, deduped
const envKeys = out.implied_env_vars.map((e) => e.key);
check('env: SUPABASE_URL present', envKeys.includes('SUPABASE_URL'));
check('env: SUPABASE_PUBLISHABLE_KEY present', envKeys.includes('SUPABASE_PUBLISHABLE_KEY'));
check('env: SUPABASE_ANON_KEY absent', !envKeys.includes('SUPABASE_ANON_KEY'));
check('env: SUPABASE_URL deduped once', envKeys.filter((k) => k === 'SUPABASE_URL').length === 1);
check('env: STRIPE_SECRET_KEY present', envKeys.includes('STRIPE_SECRET_KEY'));
check('env: RESEND_API_KEY present', envKeys.includes('RESEND_API_KEY'));
check('env: POSTHOG_KEY present', envKeys.includes('POSTHOG_KEY'));
check('env: SENTRY_DSN present', envKeys.includes('SENTRY_DSN'));
check('env: stock provider keys (Unsplash + Pexels)', envKeys.includes('UNSPLASH_ACCESS_KEY') && envKeys.includes('PEXELS_API_KEY'));
check('env: removed content CMS derivations absent', !Object.keys(derivation.env_vars || {}).some((key) => key.startsWith('content.cms:')));

// 3 · assets implied by platforms + app_type (design-system choices excluded)
const assetIds = out.required_assets.map((a) => a.asset_id);
check('asset: logo_primary (app_type present)', assetIds.includes('logo_primary'));
check('asset: favicon (web)', assetIds.includes('favicon'));
check('asset: og_image (web)', assetIds.includes('og_image'));
check('asset: app_icon_ios (ios)', assetIds.includes('app_icon_ios'));
check('asset: NO app_icon_android (no android)', !assetIds.includes('app_icon_android'));

// 4 · provider implications
check('implication: supabase note', out.provider_implications.some((i) => i.provider === 'supabase' && /bundles/i.test(i.note)));

// 5 · readiness shape (UI-only)
check('readiness overall 1..100', out.readiness.overall_pct > 0 && out.readiness.overall_pct <= 100);
check('readiness per_section present', Array.isArray(out.readiness.per_section) && out.readiness.per_section.length > 0);
check('readiness weighted_by', JSON.stringify(out.readiness.weighted_by) === JSON.stringify(['recommended', 'optional']));
check('missing_decisions is array', Array.isArray(out.missing_decisions));

// 6 · custom-value opacity — a custom backend drives NO env vars but counts resolved
const customOut = deriveRequirements({ 'database.provider.custom': 'Convex', 'project.type': 'saas', 'project.platforms': ['web'] }, catalogue);
check('custom: no env vars from Convex', !customOut.implied_env_vars.some((e) => /CONVEX/i.test(e.key)));
check('custom: still derives web assets', customOut.required_assets.some((a) => a.asset_id === 'favicon'));

// 7 · empty draft — readiness 0, lists empty, missing has required decisions
const empty = deriveRequirements({}, catalogue);
check('empty readiness 0', empty.readiness.overall_pct === 0);
check('empty env/assets empty', empty.implied_env_vars.length === 0 && empty.required_assets.length === 0);
check('empty missing has recommended', empty.missing_decisions.some((m) => m.severity === 'recommended'));

if (failures.length) {
  console.error(`✗ test-derive FAILED — ${failures.length} of ${pass + failures.length}:`);
  for (const f of failures) console.error('    - ' + f);
  process.exit(1);
}
console.log(`✓ test-derive passed — ${pass} checks (determinism, env/assets/implications, custom opacity, readiness)`);
