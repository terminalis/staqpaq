#!/usr/bin/env node
// assert-inert-interactive-surface
//
// Present because ux-design.yaml declares ONE interactive surface
// (review_export :: live_preview). The live staqpaq.yaml preview holds no
// authority: it commits ONLY through export_pack, which RE-DERIVES every
// previewed value from canonical state at commit — never scraped from the
// rendered preview DOM, never accepted as a payload from the UI.
//
// Two mechanical guarantees:
//   1. No logic module (src/core/**) imports the presentation layer
//      (src/ui/**). export_pack therefore cannot read the rendered preview; it
//      can only re-run the pure derive/serialize functions over canonical state.
//   2. Every UI invocation of export_pack passes ONLY `scope` (yaml|pack) — no
//      derived values (the serialized yaml, env vars, asset list, missing set,
//      readiness) are handed to the capability.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT, walk, rawSpecifiers, resolveSpecifier, relPosix, under, finish,
} from './_lib.mjs';

const CORE_DIR = 'src/core';
const UI_DIR = 'src/ui';
const violations = [];

// --- Guarantee 1: logic never imports presentation --------------------------
for (const file of walk(join(ROOT, 'src', 'core'))) {
  const rf = relPosix(file);
  for (const spec of rawSpecifiers(file)) {
    const r = resolveSpecifier(file, spec);
    if (r.kind === 'file' && under(relPosix(r.path), UI_DIR)) {
      violations.push(
        `${rf} (logic layer) imports the presentation layer ('${spec}' -> ${relPosix(r.path)}) — capabilities must re-derive from canonical state, never read the rendered preview`,
      );
    }
  }
}

// --- Guarantee 2: UI export invocations pass only `scope` -------------------
// The capability output names that must NEVER be passed back in as input — if
// the UI hands any of these to export_pack it is trusting the preview.
const FORBIDDEN_PAYLOAD = [
  'staqpaq_yaml', 'staqpaq_md', 'asset_checklist_md', 'missing_decisions_md',
  'env_example', 'pack_zip', 'implied_env_vars', 'required_assets',
  'provider_implications', 'missing_decisions', 'readiness', 'yaml', 'body',
];

/** Extract the first balanced { ... } object literal at/after `fromIdx`. */
function bracedAfter(src, fromIdx) {
  const start = src.indexOf('{', fromIdx);
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return null;
}

const EXPORT_RE = /export_pack/g;

for (const file of walk(join(ROOT, 'src', 'ui'))) {
  const rf = relPosix(file);
  const src = readFileSync(file, 'utf8');
  EXPORT_RE.lastIndex = 0;
  let m;
  while ((m = EXPORT_RE.exec(src))) {
    // Only consider occurrences that are part of an invocation call site.
    const before = src.slice(Math.max(0, m.index - 60), m.index);
    if (!/(invoke_?intent|runIntent|capabilityId)/i.test(before)) continue;

    const inputObj = bracedAfter(src, m.index);
    if (!inputObj) {
      violations.push(`${rf} invokes export_pack without an explicit { scope } input object`);
      continue;
    }
    if (!/\bscope\b/.test(inputObj)) {
      violations.push(`${rf} invokes export_pack but does not pass \`scope\` — only scope (yaml|pack) is permitted`);
    }
    for (const key of FORBIDDEN_PAYLOAD) {
      const keyRe = new RegExp('(^|[^\\w.])' + key + '\\s*:');
      if (keyRe.test(inputObj)) {
        violations.push(
          `${rf} passes derived value '${key}' to export_pack — the commit must pass ONLY scope; export_pack re-derives everything from canonical state`,
        );
      }
    }
  }
}

finish('assert-inert-interactive-surface', violations);
