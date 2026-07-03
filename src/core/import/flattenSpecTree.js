// Invert buildSpecTree: walk catalogue.allFields (catalogue order) and read each
// field's value out of a parsed staqpaq.yaml tree, rebuilding the flat
// selections map in the exact shapes the capabilities write:
//   text/color        -> string at "<path>"
//   boolean           -> boolean at "<path>"
//   single_select     -> curated key at "<path>", or free text at "<path>.custom"
//   multi_select      -> curated keys at "<path>" + free strings at "<path>.custom"
//                        (normalizeSelections re-adds the "other" sentinel)
// Posture: normalize-then-adopt, never trust — anything that doesn't map to a
// current catalogue field (unknown paths, wrong shapes, free text on a field
// without a custom hatch, status_only fields which are never exported) is
// DROPPED and reported, not guessed at. Pure: no state, no side effects.

import { CUSTOM_SENTINEL } from '../catalogue/custom.js';

function getPath(tree, path) {
  let node = tree;
  for (const part of String(path).split('.')) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return undefined;
    node = node[part];
  }
  return node;
}

/** Leaf dot-paths present in a parsed tree (arrays and scalars are leaves). */
function leafPaths(tree, prefix = '') {
  const out = [];
  for (const key of Object.keys(tree || {})) {
    const val = tree[key];
    const path = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === 'object' && !Array.isArray(val)) out.push(...leafPaths(val, path));
    else out.push(path);
  }
  return out;
}

/**
 * @returns {{ selections: object, dropped_paths: string[] }} — the rebuilt flat
 * map plus every leaf path (or list member, as "path[member]") that did not map.
 */
export function flattenSpecTree(tree, catalogue) {
  const selections = {};
  const dropped = [];
  const claimed = new Set();

  for (const field of catalogue.allFields || []) {
    const raw = getPath(tree, field.path);
    if (raw === undefined) continue;
    claimed.add(field.path);

    if (field.status_only) {
      dropped.push(field.path); // never exported, so never importable
      continue;
    }

    if (field.kind === 'text' || field.kind === 'color') {
      if (typeof raw === 'string' && raw !== '') selections[field.path] = raw;
      else dropped.push(field.path);
      continue;
    }

    if (field.kind === 'boolean') {
      if (typeof raw === 'boolean') selections[field.path] = raw;
      else dropped.push(field.path);
      continue;
    }

    const keys = new Set((field.options || []).map((o) => o.key));

    if (field.kind === 'single_select') {
      if (typeof raw === 'string' && keys.has(raw)) selections[field.path] = raw;
      else if (typeof raw === 'string' && raw !== '' && field.custom) selections[field.path + '.custom'] = raw;
      else dropped.push(field.path);
      continue;
    }

    if (field.kind === 'multi_select') {
      const members = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : null;
      if (!members) {
        dropped.push(field.path);
        continue;
      }
      const picked = [];
      const custom = [];
      for (const m of members) {
        if (typeof m !== 'string' || m === '') { dropped.push(`${field.path}[${String(m)}]`); continue; }
        // the bare sentinel never round-trips (export strips it) — free text stands in for it
        if (m === CUSTOM_SENTINEL) continue;
        if (keys.has(m)) { if (!picked.includes(m)) picked.push(m); }
        else if (field.custom) { if (!custom.includes(m)) custom.push(m); }
        else dropped.push(`${field.path}[${m}]`);
      }
      if (picked.length) selections[field.path] = picked;
      if (custom.length) selections[field.path + '.custom'] = custom;
      continue;
    }

    dropped.push(field.path); // unknown field kind — refuse rather than guess
  }

  for (const path of leafPaths(tree)) {
    if (!claimed.has(path)) dropped.push(path); // no current catalogue field owns it
  }

  return { selections, dropped_paths: dropped };
}
