// derive_requirements — the deterministic derived read-model. A PURE function of
// (selections, catalogue): identical inputs yield identical output. It mutates
// nothing and emits nothing. This is the SAME derivation export_pack re-runs at
// commit (the inert-surface guarantee). (capabilities.yaml :: derive_requirements)
//
// All iteration is in CATALOGUE ORDER (not selection-insertion order) so the
// output is byte-identical for identical state regardless of how the selections
// map was built — the determinism export_pack depends on. Custom / free values
// are OPAQUE: they drive no env vars, provider implications, or assets (they DO
// count as resolved for readiness / missing-decisions). Readiness is UI-only.

import { conditionHolds, fieldApplies, sectionApplies } from '../catalogue/conditions.js';
import { customList } from '../catalogue/custom.js';

const SEVERITY_WEIGHT = { recommended: 2, optional: 1 };

/** True when a field has an active resolved decision (curated value or custom). */
export function isResolved(field, selections) {
  const v = selections[field.path];
  const custom = selections[field.path + '.custom'];
  if (field.kind === 'multi_select') {
    if (customList(custom).length > 0) return true;
    return Array.isArray(v) && v.length > 0;
  }
  if (custom !== undefined && custom !== '') return true;
  if (field.kind === 'boolean') return typeof v === 'boolean';
  return v !== undefined && v !== '' && v !== null;
}

/** Selected (path, key) provider tuples in catalogue order. Free/custom/boolean
 *  values are skipped — only curated option keys can name a provider. */
function providerTuples(selections, catalogue) {
  const tuples = [];
  for (const field of catalogue.allFields) {
    if (field.kind === 'text' || field.kind === 'color' || field.kind === 'boolean') continue;
    const v = selections[field.path];
    if (v === undefined) continue;
    if (Array.isArray(v)) for (const m of v) tuples.push({ path: field.path, key: String(m) });
    else tuples.push({ path: field.path, key: String(v) });
  }
  return tuples;
}

export function deriveRequirements(selections = {}, catalogue) {
  const sel = selections || {};
  const env = (catalogue.derivation && catalogue.derivation.env_vars) || {};
  const impl = (catalogue.derivation && catalogue.derivation.implications) || {};
  const assetRules = (catalogue.derivation && catalogue.derivation.assets) || [];
  const tuples = providerTuples(sel, catalogue);

  // implied_env_vars — from SELECTED providers only; deduped by key, deterministic order
  const implied_env_vars = [];
  const seenEnv = new Set();
  for (const t of tuples) {
    const list = env[`${t.path}:${t.key}`];
    if (!list) continue;
    for (const e of list) {
      if (seenEnv.has(e.key)) continue;
      seenEnv.add(e.key);
      implied_env_vars.push({ key: e.key, from_provider: e.from_provider });
    }
  }

  // provider_implications — provider-driven consequences of current selections
  const provider_implications = [];
  for (const t of tuples) {
    const notes = impl[`${t.path}:${t.key}`];
    if (!notes) continue;
    for (const note of notes) provider_implications.push({ path: t.path, provider: t.key, note });
  }

  // required_assets — actual brand-asset files implied by selections (asset rules
  // in file order; design-system choices are excluded by the data, not by code)
  // have-status: which implied files the user has ticked in the brand checklist
  // (status_only field — informs this companion + the review UI, never staqpaq.yaml)
  const brandHave = new Set(Array.isArray(sel['assets.brand_checklist']) ? sel['assets.brand_checklist'] : []);
  const required_assets = [];
  for (const rule of assetRules) {
    if ((rule.when || []).every((c) => conditionHolds(c, sel))) {
      required_assets.push({
        asset_id: rule.asset_id,
        label: rule.label,
        filename_hint: rule.filename_hint,
        have: !!(rule.brand_key && brandHave.has(rule.brand_key)),
      });
    }
  }

  // missing_decisions (applicable, required, unresolved) + severity-weighted readiness
  const missing_decisions = [];
  const per_section = [];
  let totalWeight = 0;
  let resolvedWeight = 0;
  for (const section of catalogue.sections) {
    if (!sectionApplies(section, sel)) continue;
    let secTotal = 0;
    let secResolved = 0;
    for (const field of section.fields || []) {
      if (!fieldApplies(field, sel)) continue;
      const w = SEVERITY_WEIGHT[field.severity] || 1;
      secTotal += w;
      totalWeight += w;
      if (isResolved(field, sel)) {
        secResolved += w;
        resolvedWeight += w;
      } else if (field.severity === 'recommended') {
        missing_decisions.push({ path: field.path, label: field.label, severity: field.severity });
      }
    }
    per_section.push({ section_id: section.id, pct: secTotal === 0 ? 100 : Math.round((secResolved / secTotal) * 100) });
  }
  const overall_pct = totalWeight === 0 ? 0 : Math.round((resolvedWeight / totalWeight) * 100);

  return {
    required_assets,
    implied_env_vars,
    provider_implications,
    missing_decisions,
    readiness: { overall_pct, per_section, weighted_by: ['recommended', 'optional'] },
  };
}
