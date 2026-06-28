// Read-only catalogue loader (logic layer). Fetches + parses the three static
// data files ONCE, validates them, deep-freezes them, builds lookup indexes,
// and exposes them read-only to capabilities. No mutation; no business logic
// beyond loading / parsing / indexing. (build-sequence Step 3)
//
// The access path is resolved from import.meta.url so it works regardless of
// where index.html is served from. Data is fetched as static JSON (the catalogue
// + compatibility rule map + sample fixture are version-controlled static data).

import { validateCatalogueData } from './validate.js';

let _cache = null;

async function fetchJson(name) {
  const url = new URL(`../../../data/${name}`, import.meta.url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to load data/${name}: ${res.status}`);
  return res.json();
}

/** Recursively freeze plain objects/arrays so the catalogue is immutable. */
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

function buildCatalogue(catalogue, derivation, sample) {
  deepFreeze(catalogue);
  deepFreeze(derivation);
  deepFreeze(sample);

  const fieldByPath = new Map();
  const sectionByFieldPath = new Map();
  const allFields = [];
  for (const section of catalogue.sections) {
    for (const field of section.fields || []) {
      fieldByPath.set(field.path, field);
      sectionByFieldPath.set(field.path, section);
      allFields.push(field);
    }
  }

  return Object.freeze({
    version: catalogue.version,
    sections: catalogue.sections,            // frozen
    derivation,                              // frozen { env_vars, implications, assets }
    sampleSelections: sample ? sample.selections : {},  // frozen
    // indexes (built once; read-only by convention)
    fieldByPath,
    sectionByFieldPath,
    allFields,
    /** Look up a field definition by canonical dot-path. */
    getField(path) { return fieldByPath.get(path) || null; },
    /** The section that owns a field path. */
    getSectionOf(path) { return sectionByFieldPath.get(path) || null; },
  });
}

/** Load (once) and cache the catalogue. Idempotent. */
export async function loadCatalogue() {
  if (_cache) return _cache;
  const [catalogue, derivation, sample] = await Promise.all([
    fetchJson('catalogue.json'),
    fetchJson('derivation.json'),
    fetchJson('sample.json'),
  ]);
  const issues = validateCatalogueData(catalogue, derivation, sample);
  if (issues.length) {
    throw new Error('catalogue validation failed:\n  - ' + issues.join('\n  - '));
  }
  _cache = buildCatalogue(catalogue, derivation, sample);
  return _cache;
}

/** The already-loaded catalogue (throws if loadCatalogue() has not resolved). */
export function getCatalogue() {
  if (!_cache) throw new Error('catalogue not loaded — call loadCatalogue() during boot first');
  return _cache;
}
