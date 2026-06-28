#!/usr/bin/env node
// test-capabilities — a headless dev/CI test (NOT a boundary assertion) for the
// Step 6 configuration capabilities + gating/sweep engine. Exercises the pure
// handlers directly (the orchestrator's persist/emit are tested in the browser)
// over the real catalogue data: error codes, set/toggle/deselect, gating reject,
// stateless reversible sweep, and the "never retain empties" invariant.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { recordSelection } from '../src/core/capabilities/recordSelection.js';
import { clearSelection } from '../src/core/capabilities/clearSelection.js';
import { setCustomValue } from '../src/core/capabilities/setCustomValue.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogueJson = JSON.parse(readFileSync(join(ROOT, 'data', 'catalogue.json'), 'utf8'));

// Build the minimal catalogue object the handlers expect (mirrors loader index).
const fieldByPath = new Map();
const sectionByFieldPath = new Map();
const allFields = [];
for (const section of catalogueJson.sections) {
  for (const field of section.fields || []) {
    fieldByPath.set(field.path, field);
    sectionByFieldPath.set(field.path, section);
    allFields.push(field);
  }
}
const catalogue = {
  sections: catalogueJson.sections,
  allFields,
  getField: (p) => fieldByPath.get(p) || null,
  getSectionOf: (p) => sectionByFieldPath.get(p) || null,
};

let pass = 0;
const failures = [];
function check(name, cond) {
  if (cond) pass++;
  else failures.push(name);
}
// run a handler against a selections snapshot
const ctx = (selections) => ({ catalogue, draft: { selections } });

// 1 · record single_select
let out = recordSelection(ctx({}), { path: 'database.provider', option_key: 'supabase' });
check('record supabase ok', !out.error && out.selections['database.provider'] === 'supabase');

// 2 · requires satisfied (Convex Storage requires the Convex backend; Supabase/Firebase
// storage are intentionally UNGATED so they can pair with any database)
out = recordSelection(ctx({ 'database.provider': 'convex' }), { path: 'backend.storage', option_key: 'convex_storage' });
check('record convex_storage ok (requires met)', !out.error && out.selections['backend.storage'] === 'convex_storage');

// 3 · gated by precludes (Firebase precluded by a Supabase backend, same field)
out = recordSelection(ctx({ 'database.provider': 'supabase' }), { path: 'database.provider', option_key: 'firebase' });
check('firebase OPTION_GATED', out.error && out.error.code === 'OPTION_GATED' && /Supabase/.test(out.error.reason));

// 4 · a `requires` no longer gates on an UNDECIDED upstream — convex_storage is
// selectable until a non-Convex backend actually rules it out
out = recordSelection(ctx({}), { path: 'backend.storage', option_key: 'convex_storage' });
check('convex_storage selectable with no backend chosen', !out.error && out.selections['backend.storage'] === 'convex_storage');
out = recordSelection(ctx({ 'database.provider': 'neon' }), { path: 'backend.storage', option_key: 'convex_storage' });
check('convex_storage gated once a non-Convex backend is chosen', out.error?.code === 'OPTION_GATED');

// 5 · bidirectional rule-out (requires) — a selected option that REQUIRES a
// specific upstream makes the incompatible upstream values unavailable instead of
// silently sweeping; clearing the upstream is still fine (nothing rules it out)
out = recordSelection(ctx({ 'database.provider': 'convex', 'backend.storage': 'convex_storage' }), { path: 'database.provider', option_key: 'neon' });
check('non-Convex backend ruled out by the selected Convex Storage', out.error?.code === 'OPTION_GATED');
out = clearSelection(ctx({ 'database.provider': 'convex', 'backend.storage': 'convex_storage' }), { path: 'database.provider' });
check('clearing the backend keeps storage (not ruled out)', !out.error && out.selections['database.provider'] === undefined && out.selections['backend.storage'] === 'convex_storage');

// 6 · bidirectional rule-out (precludes) — selecting web-only Tailwind makes the
// React Native framework it precludes unavailable, rather than sweeping it
out = recordSelection(ctx({ 'frontend.styling': 'tailwind' }), { path: 'frontend.framework', option_key: 'react_native' });
check('react_native ruled out by the selected Tailwind', out.error?.code === 'OPTION_GATED');
out = recordSelection(ctx({ 'frontend.styling': 'tailwind' }), { path: 'frontend.framework', option_key: 'nextjs' });
check('a compatible framework is still selectable with Tailwind', !out.error && out.selections['frontend.framework'] === 'nextjs');

// 7 · stateless reversibility — record a framework, clear it, re-record a style cleanly
out = clearSelection(ctx({ 'frontend.framework': 'react_native' }), { path: 'frontend.framework' });
check('clear framework leaves an empty draft', out.selections['frontend.styling'] === undefined && out.selections['frontend.framework'] === undefined);
out = recordSelection(ctx({}), { path: 'frontend.styling', option_key: 'tailwind' });
check('tailwind re-recordable once framework cleared', !out.error && out.selections['frontend.styling'] === 'tailwind');

// 8 · multi_select toggle + empties never retained
out = recordSelection(ctx({ 'project.platforms': ['web'] }), { path: 'project.platforms', option_key: 'ios' });
check('multi toggle add', Array.isArray(out.selections['project.platforms']) && out.selections['project.platforms'].length === 2);
out = recordSelection(ctx({ 'project.platforms': ['web', 'ios'] }), { path: 'project.platforms', option_key: 'web' });
check('multi toggle remove', JSON.stringify(out.selections['project.platforms']) === JSON.stringify(['ios']));
out = recordSelection(ctx({ 'project.platforms': ['ios'] }), { path: 'project.platforms', option_key: 'ios' });
check('multi emptied → key removed (no empty array)', out.selections['project.platforms'] === undefined);

// 9 · boolean set + re-record deselect — the live catalogue has no boolean field
// anymore (cookie consent moved into surface.policy_pages), so exercise the
// still-supported boolean kind against a local synthetic field.
const boolField = { path: 'flags.test', label: 'Test flag', kind: 'boolean', severity: 'recommended' };
const boolCat = {
  sections: catalogue.sections,
  allFields: [...allFields, boolField],
  getField: (p) => (p === boolField.path ? boolField : catalogue.getField(p)),
  getSectionOf: (p) => (p === boolField.path ? catalogue.sections[0] : catalogue.getSectionOf(p)),
};
const boolCtx = (selections) => ({ catalogue: boolCat, draft: { selections } });
out = recordSelection(boolCtx({}), { path: 'flags.test', option_key: 'true' });
check('boolean set true', out.selections['flags.test'] === true);
out = recordSelection(boolCtx({ 'flags.test': true }), { path: 'flags.test', option_key: 'true' });
check('boolean re-record → deselect', out.selections['flags.test'] === undefined);

// 10 · brand assets (multi_select inventory; status_only — excluded from staqpaq.yaml)
out = recordSelection(ctx({}), { path: 'assets.brand_checklist', option_key: 'logo' });
check('brand asset toggled on', Array.isArray(out.selections['assets.brand_checklist']) && out.selections['assets.brand_checklist'].includes('logo'));

// 11 · UNKNOWN_PATH
check('UNKNOWN_PATH', recordSelection(ctx({}), { path: 'no.such.path', option_key: 'x' }).error?.code === 'UNKNOWN_PATH');
// 12 · UNKNOWN_OPTION
check('UNKNOWN_OPTION', recordSelection(ctx({}), { path: 'database.provider', option_key: 'bogus' }).error?.code === 'UNKNOWN_OPTION');
check('UNKNOWN_OPTION for non-primitive option key',
  recordSelection(ctx({}), { path: 'database.provider', option_key: { toString: () => 'supabase' } }).error?.code === 'UNKNOWN_OPTION');
check('UNKNOWN_OPTION for removed literal custom provider',
  recordSelection(ctx({}), { path: 'database.provider', option_key: 'custom' }).error?.code === 'UNKNOWN_OPTION');
// 13 · payments options are gated (not hidden) until a paid revenue model is set
check('payments OPTION_GATED without paid model', recordSelection(ctx({ 'business.revenue_model': 'free' }), { path: 'payments.provider', option_key: 'stripe' }).error?.code === 'OPTION_GATED');
check('payments selectable with paid model', !recordSelection(ctx({ 'business.revenue_model': 'subscription' }), { path: 'payments.provider', option_key: 'stripe' }).error);
const addedPaymentFlows = ['embedded_checkout', 'marketplace_payouts', 'payment_links', 'quote_to_invoice', 'subscription_management', 'usage_billing'];
check('new payment flows are gated under free',
  addedPaymentFlows.every((key) => recordSelection(ctx({ 'business.revenue_model': 'free' }), { path: 'payments.flows', option_key: key }).error?.code === 'OPTION_GATED'));
check('new payment flows are selectable with a monetized model',
  addedPaymentFlows.every((key) => !recordSelection(ctx({ 'business.revenue_model': 'subscription' }), { path: 'payments.flows', option_key: key }).error));

// 14 · set_custom_value free kind (text → stored at path)
out = setCustomValue(ctx({}), { path: 'project.name', value: 'Acme Analytics' });
check('text free value at path', !out.error && out.selections['project.name'] === 'Acme Analytics');

// 15 · set_custom_value custom hatch — clears the curated value (mutual exclusion).
// The custom value is opaque, so a dependent that required the old curated value is
// NOT swept: an undecided/opaque upstream rules nothing out.
out = setCustomValue(ctx({ 'database.provider': 'supabase', 'backend.storage': 'supabase_storage' }), { path: 'database.provider', value: 'Convex' });
check('custom hatch stored at .custom', out.selections['database.provider.custom'] === 'Convex' && out.selections['database.provider'] === undefined);
check('custom hatch keeps dependent storage (opaque upstream rules nothing out)', out.selections['backend.storage'] === 'supabase_storage');
check('custom_value_set emitted', out.events.some((e) => e.name === 'custom_value_set' && e.payload.value === 'Convex'));

// 16 · CUSTOM_NOT_ALLOWED (business.revenue_model is single_select, custom:false)
check('CUSTOM_NOT_ALLOWED', setCustomValue(ctx({}), { path: 'business.revenue_model', value: 'x' }).error?.code === 'CUSTOM_NOT_ALLOWED');

// 17 · recording a curated value clears an existing custom value (mutual exclusion)
out = recordSelection(ctx({ 'database.provider.custom': 'Convex' }), { path: 'database.provider', option_key: 'neon' });
check('curated clears custom (mutual exclusion)', out.selections['database.provider'] === 'neon' && out.selections['database.provider.custom'] === undefined);

// 18 · multi_select custom coexists (the free-text "Other" is additive, NOT mutually
// exclusive — unlike a single_select, it must not wipe the other picked options)
let m = recordSelection(ctx({}), { path: 'business.fulfilment', option_key: 'api_access' }).selections;
m = recordSelection(ctx(m), { path: 'business.fulfilment', option_key: 'other' }).selections;
check('multi custom: Other coexists with picks', JSON.stringify(m['business.fulfilment']) === JSON.stringify(['api_access', 'other']));
m = setCustomValue(ctx(m), { path: 'business.fulfilment', value: 'White-glove' }).selections;
check('multi custom: typing free text preserves the array', JSON.stringify(m['business.fulfilment']) === JSON.stringify(['api_access', 'other']) && JSON.stringify(m['business.fulfilment.custom']) === JSON.stringify(['White-glove']));
m = recordSelection(ctx(m), { path: 'business.fulfilment', option_key: 'credits' }).selections;
check('multi custom: picking another option keeps the free text', JSON.stringify(m['business.fulfilment.custom']) === JSON.stringify(['White-glove']));
m = recordSelection(ctx(m), { path: 'business.fulfilment', option_key: 'other' }).selections;
check('multi custom: deselecting Other clears its free text', !(m['business.fulfilment'] || []).includes('other') && m['business.fulfilment.custom'] === undefined);

// 19 · gating wired this session — commission/donation/affiliate unlock payments;
// component & styling kits gate on framework compatibility
const G = (sel, path, key) => recordSelection(ctx(sel), { path, option_key: key }).error;
check('commission unlocks payments', !G({ 'business.revenue_model': 'commission' }, 'payments.provider', 'stripe'));
check('donation unlocks payments', !G({ 'business.revenue_model': 'donation' }, 'payments.provider', 'stripe'));
check('affiliate unlocks payments', !G({ 'business.revenue_model': 'affiliate' }, 'payments.provider', 'stripe'));
check('free still does NOT unlock payments', G({ 'business.revenue_model': 'free' }, 'payments.provider', 'stripe')?.code === 'OPTION_GATED');
check('mantine available with no framework chosen', !G({}, 'frontend.component_library', 'mantine'));
check('mantine gated by a non-React framework', G({ 'frontend.framework': 'vue' }, 'frontend.component_library', 'mantine')?.code === 'OPTION_GATED');
check('mantine ok with React', !G({ 'frontend.framework': 'react' }, 'frontend.component_library', 'mantine'));
check('gluestack gated on a web framework', G({ 'frontend.framework': 'nextjs' }, 'frontend.component_library', 'gluestack')?.code === 'OPTION_GATED');
check('gluestack ok with Expo', !G({ 'frontend.framework': 'expo' }, 'frontend.component_library', 'gluestack'));
check('daisyui precluded on a native target', G({ 'frontend.framework': 'react_native' }, 'frontend.component_library', 'daisyui')?.code === 'OPTION_GATED');
check('nativewind gated on a web framework', G({ 'frontend.framework': 'nextjs' }, 'frontend.styling', 'nativewind')?.code === 'OPTION_GATED');
check('nativewind ok with React Native', !G({ 'frontend.framework': 'react_native' }, 'frontend.styling', 'nativewind'));
check('plain_css precluded on a native target', G({ 'frontend.framework': 'flutter' }, 'frontend.styling', 'plain_css')?.code === 'OPTION_GATED');
check('sass precluded on a native target', G({ 'frontend.framework': 'react_native' }, 'frontend.styling', 'sass')?.code === 'OPTION_GATED');
check('vanilla_extract precluded on a native target', G({ 'frontend.framework': 'flutter' }, 'frontend.styling', 'vanilla_extract')?.code === 'OPTION_GATED');

// 20 · bidirectional rule-out — picking a DOWNSTREAM option narrows the UPSTREAM
// field (a selection elsewhere rules an option here out, in reverse)
check('selecting Mantine rules out a non-React framework', G({ 'frontend.component_library': 'mantine' }, 'frontend.framework', 'vue')?.code === 'OPTION_GATED');
check('selecting Mantine still allows a React framework', !G({ 'frontend.component_library': 'mantine' }, 'frontend.framework', 'react'));
check('selecting NativeWind rules out a web framework', G({ 'frontend.styling': 'nativewind' }, 'frontend.framework', 'nextjs')?.code === 'OPTION_GATED');
check('selecting NativeWind still allows React Native', !G({ 'frontend.styling': 'nativewind' }, 'frontend.framework', 'react_native'));
check('reverse precludes — selecting Tailwind rules out React Native', G({ 'frontend.styling': 'tailwind' }, 'frontend.framework', 'react_native')?.code === 'OPTION_GATED');
check('a fresh draft rules nothing out (no reverse without a selection)', !G({}, 'frontend.framework', 'vue'));

// 21 · typography pairing autofill — a single_select declaring `pairs_to` suggests
// the complementary secondary (data-driven via the option's `pairs_with`), only when
// the secondary is unresolved, never from the "Other" sentinel, never stomping a pick
out = recordSelection(ctx({}), { path: 'design.typography.primary', option_key: 'poppins' });
check('pairing: primary recorded', out.selections['design.typography.primary'] === 'poppins');
check('pairing: secondary autofilled from primary', out.selections['design.typography.secondary'] === 'inter');
out = recordSelection(ctx({ 'design.typography.secondary': 'roboto' }), { path: 'design.typography.primary', option_key: 'poppins' });
check('pairing: an existing curated secondary is preserved', out.selections['design.typography.secondary'] === 'roboto');
out = recordSelection(ctx({ 'design.typography.secondary.custom': 'Comic Sans' }), { path: 'design.typography.primary', option_key: 'poppins' });
check('pairing: an existing custom secondary is preserved', out.selections['design.typography.secondary'] === undefined && out.selections['design.typography.secondary.custom'] === 'Comic Sans');
out = recordSelection(ctx({}), { path: 'design.typography.primary', option_key: 'other' });
check('pairing: the Other sentinel does not autofill', out.selections['design.typography.secondary'] === undefined);
out = recordSelection(ctx({ 'design.typography.primary': 'poppins' }), { path: 'design.typography.primary', option_key: 'poppins' });
check('pairing: deselecting the primary does not autofill', out.selections['design.typography.primary'] === undefined && out.selections['design.typography.secondary'] === undefined);

// 23 · exclusive + custom multi_select (backend.jobs) — the exclusive "None"
// collapses the field AND clears the now-orphaned "Other" free-text it drops
let bw = recordSelection(ctx({}), { path: 'backend.jobs', option_key: 'inngest' }).selections;
bw = recordSelection(ctx(bw), { path: 'backend.jobs', option_key: 'other' }).selections;
bw = setCustomValue(ctx(bw), { path: 'backend.jobs', value: 'Kafka stream' }).selections;
check('bg work: Other free text coexists with picks', JSON.stringify(bw['backend.jobs']) === JSON.stringify(['inngest', 'other']) && JSON.stringify(bw['backend.jobs.custom']) === JSON.stringify(['Kafka stream']));
bw = recordSelection(ctx(bw), { path: 'backend.jobs', option_key: 'none' }).selections;
check('bg work: exclusive None collapses to [none]', JSON.stringify(bw['backend.jobs']) === JSON.stringify(['none']));
check('bg work: exclusive None clears the orphaned Other free text', bw['backend.jobs.custom'] === undefined);
bw = recordSelection(ctx(bw), { path: 'backend.jobs', option_key: 'vercel' }).selections;
check('bg work: a normal option clears the exclusive None', JSON.stringify(bw['backend.jobs']) === JSON.stringify(['vercel']));
bw = recordSelection(ctx(bw), { path: 'backend.jobs', option_key: 'none' }).selections;
bw = recordSelection(ctx(bw), { path: 'backend.jobs', option_key: 'none' }).selections;
check('bg work: re-recording the exclusive None deselects it', bw['backend.jobs'] === undefined);

// 24 · multi_select custom supports MORE THAN ONE free-text "Other" — stored as an
// array at "<path>.custom", coexisting with the picked options; blanks are dropped
let mo = recordSelection(ctx({}), { path: 'surface.screens', option_key: 'dashboard' }).selections;
mo = recordSelection(ctx(mo), { path: 'surface.screens', option_key: 'other' }).selections;
mo = setCustomValue(ctx(mo), { path: 'surface.screens', values: ['Kanban board', 'Calendar'] }).selections;
check('multi custom: two Others stored as an array', JSON.stringify(mo['surface.screens.custom']) === JSON.stringify(['Kanban board', 'Calendar']));
check('multi custom: the array coexists with the picked options', JSON.stringify(mo['surface.screens']) === JSON.stringify(['dashboard', 'other']));
mo = setCustomValue(ctx(mo), { path: 'surface.screens', values: ['Kanban board', '', 'Reports'] }).selections;
check('multi custom: blank rows are dropped', JSON.stringify(mo['surface.screens.custom']) === JSON.stringify(['Kanban board', 'Reports']));
mo = setCustomValue(ctx(mo), { path: 'surface.screens', values: [] }).selections;
check('multi custom: emptying the list clears the key', mo['surface.screens.custom'] === undefined);
const oneVal = setCustomValue(ctx({ 'surface.screens': ['other'] }), { path: 'surface.screens', value: 'Wizard' }).selections;
check('multi custom: a lone value becomes a one-item list (back-compat)', JSON.stringify(oneVal['surface.screens.custom']) === JSON.stringify(['Wizard']));

// 26 · upstream → surface.screens suggestions (soft, overridable, one-directional).
// A field-level `suggests` fires for any concrete vendor pick; option-level per option.
let su = recordSelection(ctx({ 'business.revenue_model': 'subscription' }), { path: 'payments.provider', option_key: 'stripe' }).selections;
check('suggests: Stripe seeds Checkout + Billing', JSON.stringify(su['surface.screens']) === JSON.stringify(['checkout', 'billing']));
su = recordSelection(ctx(su), { path: 'auth.provider', option_key: 'clerk' }).selections;
check('suggests: an auth provider then adds Auth (accumulates)', JSON.stringify(su['surface.screens']) === JSON.stringify(['checkout', 'billing', 'auth']));
check('suggests: one-directional — the upstream picks are untouched', su['payments.provider'] === 'stripe' && su['auth.provider'] === 'clerk');
check('suggests: the None sentinel seeds nothing', recordSelection(ctx({}), { path: 'auth.provider', option_key: 'none' }).selections['surface.screens'] === undefined);
check('suggests: the Other sentinel seeds nothing', recordSelection(ctx({}), { path: 'auth.provider', option_key: 'other' }).selections['surface.screens'] === undefined);
const pf = recordSelection(ctx({ 'business.revenue_model': 'subscription' }), { path: 'payments.flows', option_key: 'customer_portal' }).selections;
check('suggests: the Customer portal flow seeds Billing', (pf['surface.screens'] || []).includes('billing'));
const flowSuggestionTargets = {
  embedded_checkout: 'checkout',
  marketplace_payouts: 'billing',
  payment_links: 'checkout',
  quote_to_invoice: 'billing',
  subscription_management: 'billing',
  usage_billing: 'billing',
};
check('suggests: added payment flows seed their expected screen',
  Object.entries(flowSuggestionTargets).every(([key, screen]) => {
    const selections = recordSelection(ctx({ 'business.revenue_model': 'subscription' }), { path: 'payments.flows', option_key: key }).selections;
    return (selections['surface.screens'] || []).includes(screen);
  }));
check('suggests: an in-app channel seeds Settings', JSON.stringify(recordSelection(ctx({}), { path: 'notifications.channels', option_key: 'in_app' }).selections['surface.screens']) === JSON.stringify(['settings']));
const dup = recordSelection(ctx({ 'surface.screens': ['billing'], 'business.revenue_model': 'subscription' }), { path: 'payments.provider', option_key: 'stripe' }).selections;
check('suggests: never duplicates an existing screen', JSON.stringify(dup['surface.screens']) === JSON.stringify(['billing', 'checkout']));

// 27 · dismissal memory — manually removing a suggested screen is remembered, so a
// later upstream change won't re-seed it; the upstream pick is never removed
let dm = recordSelection(ctx({ 'business.revenue_model': 'subscription' }), { path: 'payments.provider', option_key: 'stripe' }).selections;
dm = recordSelection(ctx(dm), { path: 'surface.screens', option_key: 'billing' }).selections; // user removes Billing
check('dismissal: removing Billing records it dismissed', JSON.stringify(dm['surface.screens.dismissed']) === JSON.stringify(['billing']) && !(dm['surface.screens'] || []).includes('billing'));
dm = recordSelection(ctx(dm), { path: 'payments.provider', option_key: 'paddle' }).selections; // re-touch payments
check('dismissal: re-touching payments does not re-add the dismissed Billing', !(dm['surface.screens'] || []).includes('billing'));
check('dismissal: the upstream payment provider is unaffected', dm['payments.provider'] === 'paddle');
dm = recordSelection(ctx(dm), { path: 'surface.screens', option_key: 'billing' }).selections; // manual re-add
check('dismissal: manually re-adding clears the dismissed mark', (dm['surface.screens'] || []).includes('billing') && dm['surface.screens.dismissed'] === undefined);

if (failures.length) {
  console.error(`✗ test-capabilities FAILED — ${failures.length} of ${pass + failures.length}:`);
  for (const f of failures) console.error('    - ' + f);
  process.exit(1);
}
console.log(`✓ test-capabilities passed — ${pass} checks (record/clear/set-custom, gating, stateless sweep, invariants)`);
