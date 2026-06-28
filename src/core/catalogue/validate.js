// Pure catalogue validation (no fetch, no state) — runnable in both the browser
// loader and the Node validation script. Validates the catalogue against the
// five frozen field kinds and checks the sample fixture is catalogue-valid and
// ungated. (build-sequence Step 3 stop condition; capabilities.yaml :: assumptions)

import { evaluateOptionGate, fieldApplies } from './conditions.js';

// The five MVP field kinds — frozen (capabilities.yaml :: assumptions).
export const FIELD_KINDS = ['text', 'single_select', 'multi_select', 'boolean', 'color'];
const OPTION_KINDS = ['single_select', 'multi_select'];
const UNSAFE_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);
const ENV_KEY = /^[A-Z_][A-Z0-9_]*$/;
const CONTROL_OR_LINE = /[\u0000-\u001f\u007f]/;

function unsafePathSegment(path) {
  const parts = String(path || '').split('.');
  return parts.find((part) => part === '' || UNSAFE_PATH_SEGMENTS.has(part)) || null;
}

function unsafeInlineText(value) {
  return typeof value !== 'string' || CONTROL_OR_LINE.test(value);
}

/** Validate parsed catalogue/derivation/sample. Returns an array of issue
 *  strings (empty = valid). Never throws on data shape; callers decide. */
export function validateCatalogueData(catalogue, derivation, sample) {
  const issues = [];
  if (!catalogue || !Array.isArray(catalogue.sections)) {
    return ['catalogue.sections must be an array'];
  }

  const fieldByPath = new Map();
  for (const section of catalogue.sections) {
    if (!section.id) issues.push('a section is missing an id');
    for (const field of section.fields || []) {
      if (!field.path) {
        issues.push(`section ${section.id || '?'}: a field is missing a path`);
        continue;
      }
      const badSegment = unsafePathSegment(field.path);
      if (badSegment) issues.push(`field ${field.path}: unsafe path segment '${badSegment}'`);
      if (fieldByPath.has(field.path)) issues.push(`duplicate field path: ${field.path}`);
      fieldByPath.set(field.path, field);

      if (!FIELD_KINDS.includes(field.kind)) {
        issues.push(`field ${field.path}: invalid kind '${field.kind}' (allowed: ${FIELD_KINDS.join(', ')})`);
      }
      if (OPTION_KINDS.includes(field.kind)) {
        if (!Array.isArray(field.options) || field.options.length === 0) {
          issues.push(`field ${field.path} (${field.kind}): must carry a non-empty options[]`);
        } else {
          const keys = new Set();
          for (const o of field.options) {
            if (!o.key) issues.push(`field ${field.path}: an option is missing a key`);
            if (keys.has(o.key)) issues.push(`field ${field.path}: duplicate option key '${o.key}'`);
            keys.add(o.key);
          }
        }
      }
    }
  }

  const envVars = derivation && derivation.env_vars;
  if (envVars && typeof envVars === 'object') {
    for (const [source, list] of Object.entries(envVars)) {
      if (!Array.isArray(list)) {
        issues.push(`derivation env vars '${source}': must be an array`);
        continue;
      }
      for (const e of list) {
        if (!e || typeof e !== 'object') {
          issues.push(`derivation env vars '${source}': entry must be an object`);
          continue;
        }
        if (!ENV_KEY.test(String(e.key || ''))) {
          issues.push(`derivation env vars '${source}': invalid env var key '${String(e.key || '')}'`);
        }
        if (unsafeInlineText(e.from_provider)) {
          issues.push(`derivation env vars '${source}': unsafe provider text`);
        }
      }
    }
  }

  const assets = derivation && derivation.assets;
  if (assets !== undefined) {
    if (!Array.isArray(assets)) {
      issues.push('derivation assets: must be an array');
    } else {
      for (const a of assets) {
        if (!a || typeof a !== 'object') {
          issues.push('derivation asset: entry must be an object');
          continue;
        }
        if (unsafeInlineText(a.label)) issues.push(`derivation asset '${String(a.asset_id || '?')}': unsafe asset label`);
        if (unsafeInlineText(a.filename_hint)) issues.push(`derivation asset '${String(a.asset_id || '?')}': unsafe asset filename_hint`);
      }
    }
  }

  // Sample fixture: paths exist, applicable, value-shape valid, ungated.
  if (sample && sample.selections) {
    const sel = sample.selections;
    for (const [path, value] of Object.entries(sel)) {
      const field = fieldByPath.get(path);
      if (!field) {
        issues.push(`sample: unknown path '${path}'`);
        continue;
      }
      if (!fieldApplies(field, sel)) {
        issues.push(`sample: path '${path}' is not applicable under the sample selections`);
      }
      if (field.kind === 'multi_select' && !Array.isArray(value)) {
        issues.push(`sample: '${path}' (multi_select) must be an array`);
      }
      if (field.kind === 'single_select' && Array.isArray(value)) {
        issues.push(`sample: '${path}' (${field.kind}) must be a single value`);
      }
      if (field.kind === 'boolean' && typeof value !== 'boolean') {
        issues.push(`sample: '${path}' (boolean) must be true/false`);
      }
      if (field.kind === 'color' && typeof value !== 'string') {
        issues.push(`sample: '${path}' (color) must be a string`);
      }
      if (OPTION_KINDS.includes(field.kind)) {
        const byKey = new Map((field.options || []).map((o) => [o.key, o]));
        for (const v of Array.isArray(value) ? value : [value]) {
          const opt = byKey.get(String(v));
          if (!opt) {
            issues.push(`sample: '${path}' has invalid option '${v}'`);
            continue;
          }
          const gate = evaluateOptionGate(opt, sel, field, catalogue);
          if (gate.gated) issues.push(`sample: '${path}' option '${v}' is gated — ${gate.reason}`);
        }
      }
    }
  }

  return issues;
}
