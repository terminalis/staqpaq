// Normalise persisted or externally supplied selection maps back to the current
// catalogue contract before hydration/export. Pure and defensive: unknown paths,
// wrong shapes, stale option keys, and newly gated selections are dropped.

import { sweepSelections } from '../gating/sweep.js';
import { CUSTOM_SENTINEL } from '../catalogue/custom.js';

const PATH_ALIASES = [
  ['content.docs', 'support.docs'],
  ['content.docs.custom', 'support.docs.custom'],
  ['design.icons.ui', 'design.icons'],
  ['design.icons.ui.custom', 'design.icons.custom'],
  ['design.icons.brand', 'design.icons'],
  ['design.icons.brand.custom', 'design.icons.custom'],
];

const OPTION_ALIASES = {
  'database.provider': { custom: CUSTOM_SENTINEL },
  'auth.provider': { custom: CUSTOM_SENTINEL },
  'ai.providers': { custom: CUSTOM_SENTINEL },
  'frontend.framework': { remix: 'react_router' },
  'frontend.component_library': { nativebase: 'gluestack' },
  'notifications.sms': { messagebird: 'bird' },
};

function optionKeys(field) {
  return new Set((field.options || []).map((o) => o.key));
}

function own(selections, key) {
  return Object.prototype.hasOwnProperty.call(selections, key);
}

function cleanString(value) {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function cleanStringList(value) {
  const arr = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  const out = [];
  for (const item of arr) {
    if (typeof item !== 'string' || item === '' || out.includes(item)) continue;
    out.push(item);
  }
  return out;
}

function cleanCustomValue(value, multi) {
  if (multi) {
    const list = cleanStringList(value);
    return list.length ? list : undefined;
  }
  return cleanString(value);
}

function rewriteOptionValue(path, value) {
  const aliases = OPTION_ALIASES[path];
  if (!aliases) return value;
  if (Array.isArray(value)) {
    const out = [];
    for (const item of value) {
      const next = typeof item === 'string' ? aliases[item] || item : item;
      if (!out.includes(next)) out.push(next);
    }
    return out;
  }
  return typeof value === 'string' ? aliases[value] || value : value;
}

function rewriteLegacySelections(selections) {
  const next = { ...selections };
  for (const [from, to] of PATH_ALIASES) {
    if (own(next, from) && !own(next, to)) next[to] = next[from];
    delete next[from];
  }
  for (const path of Object.keys(OPTION_ALIASES)) {
    if (own(next, path)) next[path] = rewriteOptionValue(path, next[path]);
  }
  return next;
}

/** Return a catalogue-valid selection map without mutating the input. */
export function normalizeSelections(selections = {}, catalogue) {
  const source = rewriteLegacySelections(selections && typeof selections === 'object' ? selections : {});
  const normal = {};

  for (const field of catalogue.allFields || []) {
    const path = field.path;
    const customKey = path + '.custom';
    const dismissedKey = path + '.dismissed';
    const keys = optionKeys(field);

    if (field.kind === 'text' || field.kind === 'color') {
      if (own(source, path)) {
        const value = cleanString(source[path]);
        if (value !== undefined) normal[path] = value;
      }
      continue;
    }

    if (field.kind === 'boolean') {
      if (typeof source[path] === 'boolean') normal[path] = source[path];
      continue;
    }

    if (field.kind === 'single_select') {
      if (typeof source[path] === 'string' && keys.has(source[path])) {
        normal[path] = source[path];
      } else if (field.custom && own(source, customKey)) {
        const custom = cleanCustomValue(source[customKey], false);
        if (custom !== undefined) normal[customKey] = custom;
      }
      continue;
    }

    if (field.kind === 'multi_select') {
      if (Array.isArray(source[path])) {
        const picked = cleanStringList(source[path]).filter((key) => keys.has(key));
        if (picked.length) normal[path] = picked;
      }
      if (field.custom && own(source, customKey)) {
        const custom = cleanCustomValue(source[customKey], true);
        if (custom !== undefined) {
          normal[customKey] = custom;
          if (!Array.isArray(normal[path]) || !normal[path].includes(CUSTOM_SENTINEL)) {
            normal[path] = [...(normal[path] || []), CUSTOM_SENTINEL].filter((key) => keys.has(key));
          }
        }
      }
      if (Array.isArray(source[dismissedKey])) {
        const dismissed = cleanStringList(source[dismissedKey]).filter((key) => keys.has(key));
        if (dismissed.length) normal[dismissedKey] = dismissed;
      }
    }
  }

  return sweepSelections(normal, catalogue).selections;
}
