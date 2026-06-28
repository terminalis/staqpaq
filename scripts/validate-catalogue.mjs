#!/usr/bin/env node
// validate-catalogue — a dev/CI gate (NOT a boundary assertion). Reads the
// static data files and runs the SAME pure validator the browser loader uses,
// confirming the build-sequence Step 3 stop condition mechanically: the
// catalogue parses and validates against the five field kinds, and the sample
// fixture references only catalogue-valid, ungated selections.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { validateCatalogueData } from '../src/core/catalogue/validate.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (name) => JSON.parse(readFileSync(join(ROOT, 'data', name), 'utf8'));

let catalogue, derivation, sample;
try {
  catalogue = readJson('catalogue.json');
  derivation = readJson('derivation.json');
  sample = readJson('sample.json');
} catch (e) {
  console.error('✗ validate-catalogue: could not read/parse a data file: ' + e.message);
  process.exit(1);
}

const issues = validateCatalogueData(catalogue, derivation, sample);
if (issues.length) {
  console.error(`✗ validate-catalogue FAILED (${issues.length} issue(s)):`);
  for (const i of issues) console.error('    - ' + i);
  process.exit(1);
}

const regressionFailures = [];
function findField(path) {
  for (const section of catalogue.sections || []) {
    for (const field of section.fields || []) {
      if (field.path === path) return field;
    }
  }
  return null;
}

const audienceField = findField('project.audience');
const audienceKeys = new Set((audienceField?.options || []).map((option) => option.key));
if (!audienceField) {
  regressionFailures.push('project.audience field exists');
} else {
  if (audienceField.custom !== true) regressionFailures.push('project.audience has custom free-text enabled');
  if (!audienceKeys.has('internal')) regressionFailures.push('project.audience includes internal');
  if (audienceKeys.has('enterprises')) regressionFailures.push('project.audience removed enterprises');
  if (!audienceKeys.has('other')) regressionFailures.push('project.audience includes Other sentinel');
}

function expectIssue(name, dataIssues, pattern) {
  if (!dataIssues.some((i) => pattern.test(i))) regressionFailures.push(name);
}

const minimalCatalogue = {
  sections: [{ id: 'project', fields: [{ path: 'project.name', label: 'Name', kind: 'text' }] }],
};
const emptyDerivation = { env_vars: {}, implications: {}, assets: [] };
expectIssue(
  'unsafe field path segment rejected',
  validateCatalogueData({
    sections: [{ id: 'project', fields: [{ path: 'project.__proto__.name', label: 'Name', kind: 'text' }] }],
  }, emptyDerivation, { selections: {} }),
  /unsafe path segment/,
);
expectIssue(
  'invalid derivation env key rejected',
  validateCatalogueData(minimalCatalogue, {
    env_vars: { 'project.name:any': [{ key: 'BAD\nKEY', from_provider: 'Bad Provider' }] },
    implications: {},
    assets: [],
  }, { selections: {} }),
  /invalid env var key/,
);
expectIssue(
  'unsafe derivation asset text rejected',
  validateCatalogueData(minimalCatalogue, {
    env_vars: {},
    implications: {},
    assets: [{ asset_id: 'logo', label: 'Logo\n- [x] forged', filename_hint: 'logo.svg', brand_key: 'logo', when: [] }],
  }, { selections: {} }),
  /unsafe asset label/,
);
if (regressionFailures.length) {
  console.error(`âœ— validate-catalogue regression checks FAILED (${regressionFailures.length}):`);
  for (const f of regressionFailures) console.error('    - ' + f);
  process.exit(1);
}

const fieldCount = catalogue.sections.reduce((n, s) => n + (s.fields || []).length, 0);
console.log(`✓ validate-catalogue passed — ${catalogue.sections.length} sections, ${fieldCount} fields, sample ungated`);
