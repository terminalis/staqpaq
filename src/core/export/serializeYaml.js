// Serialize canonical selections into staqpaq.yaml. Pure + deterministic:
// iterates in CATALOGUE order, so identical state yields byte-identical output.
//
// Constraints (capabilities.yaml :: export_pack.constraints):
//   * starts directly at `project:` (the Identity section's fields use project.*)
//   * contains only RESOLVED decisions; empties omitted
//   * never contains version/status metadata, missing items, readiness, or
//     STATUS-ONLY fields (status_only: true — a tracked status, not a build decision)
//   * custom / free values export at the field's path (the decision the user made)

// The catalogue's free-text escape-hatch sentinel option (see projection.js).
import { customList, CUSTOM_SENTINEL } from '../catalogue/custom.js';

const UNSAFE_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

function safeObject() {
  return Object.create(null);
}

function isSafePath(path) {
  return String(path || '').split('.').every((part) => part && !UNSAFE_PATH_SEGMENTS.has(part));
}

/** The value a field contributes to staqpaq.yaml, or undefined to omit it. */
function exportValue(field, selections) {
  if (field.status_only) return undefined; // status-only fields never appear in the canonical yaml
  const v = selections[field.path];
  const custom = selections[field.path + '.custom'];

  if (field.kind === 'multi_select') {
    // a custom multi_select coexists with its free text: emit the picked keys —
    // minus the bare "Other" sentinel, which the free text elaborates — plus EACH
    // custom value (one or more) when present
    let keys = Array.isArray(v) ? v.slice() : [];
    if (field.custom) {
      keys = keys.filter((k) => k !== CUSTOM_SENTINEL);
      keys.push(...customList(custom));
    }
    return keys.length ? keys : undefined;
  }
  if (v !== undefined) {
    if (field.kind === 'boolean') return typeof v === 'boolean' ? v : undefined;
    return v === '' ? undefined : v;
  }
  if (custom !== undefined && custom !== '') return custom; // single_select / free value at the field path
  return undefined;
}

function setPath(tree, path, value) {
  if (!isSafePath(path)) return false;
  const parts = path.split('.');
  let node = tree;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof node[parts[i]] !== 'object' || node[parts[i]] === null || Array.isArray(node[parts[i]])) {
      node[parts[i]] = safeObject();
    }
    node = node[parts[i]];
  }
  node[parts[parts.length - 1]] = value;
  return true;
}

/** Nested object tree built from resolved dot-path selections, in catalogue order. */
export function buildSpecTree(selections, catalogue) {
  const tree = safeObject();
  for (const field of catalogue.allFields) {
    const val = exportValue(field, selections);
    if (val === undefined) continue;
    setPath(tree, field.path, val);
  }
  return tree;
}

const SAFE_SCALAR = /^[A-Za-z0-9][\w ./-]*$/;
const RESERVED = new Set(['true', 'false', 'null', 'yes', 'no', 'on', 'off', '~']);

function scalar(v) {
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  const s = String(v);
  if (s !== '' && SAFE_SCALAR.test(s) && !RESERVED.has(s.toLowerCase())) return s;
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function emit(node, indent, lines) {
  const pad = '  '.repeat(indent);
  for (const key of Object.keys(node)) {
    const val = node[key];
    if (Array.isArray(val)) {
      lines.push(`${pad}${key}: [${val.map(scalar).join(', ')}]`);
    } else if (val && typeof val === 'object') {
      lines.push(`${pad}${key}:`);
      emit(val, indent + 1, lines);
    } else {
      lines.push(`${pad}${key}: ${scalar(val)}`);
    }
  }
}

/** The canonical staqpaq.yaml string (empty string for an empty draft). */
export function serializeYaml(selections, catalogue) {
  const tree = buildSpecTree(selections || {}, catalogue);
  const lines = [];
  emit(tree, 0, lines);
  return lines.length ? lines.join('\n') + '\n' : '';
}
