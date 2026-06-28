// record_selection — record a resolved decision at a catalogue dot-path from the
// curated option set. Handles the option-based kinds (single_select, multi_select,
// boolean). (capabilities.yaml :: capability_definitions[record_selection]
// + orchestrator_contract.per_capability_flows[record_selection])
//
// Pure handler: returns { error? | selections, events, output }; the orchestrator
// persists + emits. Never writes state directly.

import { fieldApplies, sectionApplies, evaluateOptionGate } from '../catalogue/conditions.js';
import { sweepSelections } from '../gating/sweep.js';

// The catalogue's free-text escape-hatch sentinel option (see projection.js +
// the catalogue note). Selecting it reveals the custom input.
const CUSTOM_SENTINEL = 'other';

/** Valid option keys for a field by kind (boolean is the implicit true/false set). */
function optionKeysFor(field) {
  if (field.kind === 'boolean') return ['true', 'false'];
  return (field.options || []).map((o) => o.key);
}

/** Every multi_select path a field/option `suggests` into — the fields whose
 *  manual edits we remember as "dismissed" so upstream choices don't fight the
 *  user. Both a field (any concrete pick) and an option may carry `suggests`. */
function suggestTargetPaths(catalogue) {
  const set = new Set();
  const collect = (list) => { for (const s of list || []) if (s && s.path) set.add(s.path); };
  for (const f of catalogue.allFields || []) {
    collect(f.suggests);
    for (const o of f.options || []) collect(o.suggests);
  }
  return set;
}

/**
 * Soft, overridable auto-selection (a 1→N generalisation of `pairs_to`). Given a
 * `suggests: [{ path, keys }]` list (from a field — any concrete pick — or a
 * specific option), union each key into the target multi_select — unless it is
 * already present, currently gated, was manually dismissed (in
 * `<target>.dismissed`), or the target holds an exclusive "none". One-directional:
 * it only ever ADDS to the target, never touches the upstream. Mutates in place.
 */
function applySuggestionList(list, selections, catalogue) {
  for (const s of list || []) {
    if (!s || !s.path || !Array.isArray(s.keys)) continue;
    const targetField = catalogue.getField(s.path);
    if (!targetField || targetField.kind !== 'multi_select') continue;
    const arr = Array.isArray(selections[s.path]) ? [...selections[s.path]] : [];
    // never override an explicit "none of the above"
    const exclusiveKeys = new Set((targetField.options || []).filter((o) => o.exclusive).map((o) => o.key));
    if (arr.some((k) => exclusiveKeys.has(k))) continue;
    const dismissed = new Set(
      Array.isArray(selections[s.path + '.dismissed']) ? selections[s.path + '.dismissed'] : [],
    );
    let changed = false;
    for (const key of s.keys) {
      if (arr.includes(key) || dismissed.has(key)) continue;
      const targetOpt = (targetField.options || []).find((o) => o.key === key);
      if (!targetOpt) continue;
      if (evaluateOptionGate(targetOpt, selections, targetField, catalogue).gated) continue;
      arr.push(key);
      changed = true;
    }
    if (changed) selections[s.path] = arr;
  }
}

export function recordSelection(ctx, input) {
  const { catalogue, draft } = ctx;
  const { path, option_key, mode } = input || {};

  const field = catalogue.getField(path);
  if (!field) return { error: { code: 'UNKNOWN_PATH', path } };

  const selections = { ...draft.selections };

  // the field must be applicable under current state — its section must apply
  // AND its own applies_when must hold
  const section = catalogue.getSectionOf(path);
  if (!sectionApplies(section, selections) || !fieldApplies(field, selections)) {
    return { error: { code: 'FIELD_NOT_APPLICABLE', path } };
  }
  // option_key must belong to the field's key set (boolean = true/false)
  if (typeof option_key !== 'string' || !optionKeysFor(field).includes(option_key)) {
    return { error: { code: 'UNKNOWN_OPTION', path, option_key } };
  }
  // option_key must NOT be gated under the current selection set
  const opt = (field.options || []).find((o) => o.key === option_key);
  if (opt) {
    const gate = evaluateOptionGate(opt, selections, field, catalogue);
    if (gate.gated) {
      return { error: { code: 'OPTION_GATED', path, option_key, reason: gate.reason } };
    }
  }

  // A single-value choice is mutually exclusive with the field's custom value; a
  // multi_select coexists with its free-text "Other" (cleared only when the
  // sentinel itself is deselected — handled in the multi_select branch below).
  const customKey = path + '.custom';
  if (field.kind !== 'multi_select' && selections[customKey] !== undefined) delete selections[customKey];

  if (field.kind === 'multi_select') {
    const arr = Array.isArray(selections[path]) ? [...selections[path]] : [];
    const i = arr.indexOf(option_key);
    const remove = mode === 'remove' || (mode !== 'set' && i !== -1); // toggle by default
    let added = false;
    if (i !== -1 && remove) {
      arr.splice(i, 1);
    } else if (i === -1) {
      added = true;
      if (opt && opt.exclusive) {
        // an `exclusive` option ("none of the above") collapses the field to itself,
        // dropping every other pick — including the "Other" sentinel, whose now-
        // orphaned free-text value is cleared with it
        arr.length = 0;
        arr.push(option_key);
        delete selections[customKey];
      } else {
        // adding a normal option clears any already-chosen exclusive option
        const exclusiveKeys = new Set((field.options || []).filter((o) => o.exclusive).map((o) => o.key));
        for (let j = arr.length - 1; j >= 0; j--) if (exclusiveKeys.has(arr[j])) arr.splice(j, 1);
        arr.push(option_key);
      }
    }
    if (arr.length === 0) delete selections[path];
    else selections[path] = arr;
    // deselecting the "Other" sentinel drops its now-orphaned free-text value
    if (remove && option_key === CUSTOM_SENTINEL) delete selections[customKey];

    // dismissal memory — a MANUAL toggle of a suggests-target field is remembered:
    // removing a screen marks it dismissed (upstream choices won't re-seed it),
    // re-adding it clears the mark. The "Other" sentinel is never a suggestion.
    if (option_key !== CUSTOM_SENTINEL && suggestTargetPaths(catalogue).has(path)) {
      const dismissedKey = path + '.dismissed';
      const dismissed = new Set(Array.isArray(selections[dismissedKey]) ? selections[dismissedKey] : []);
      if (added) dismissed.delete(option_key);
      else if (remove) dismissed.add(option_key);
      if (dismissed.size) selections[dismissedKey] = [...dismissed];
      else delete selections[dismissedKey];
    }

    // adding a curated option may seed suggestions into other fields (e.g. picking
    // a payment flow seeds the Checkout/Billing screens) — overridable, never stomps
    if (added) applySuggestionList(opt && opt.suggests, selections, catalogue);
  } else if (field.kind === 'boolean') {
    const boolVal = option_key === 'true';
    if (selections[path] === boolVal) delete selections[path]; // re-record → deselect
    else selections[path] = boolVal;
  } else {
    // single_select — re-recording the current value deselects it
    if (selections[path] === option_key) {
      delete selections[path];
    } else {
      selections[path] = option_key;
      // pairing autofill — a single_select declaring `pairs_to` suggests a
      // complementary value for the target field when that field is still
      // unresolved. Data-driven (the pairing lives on the option as `pairs_with`),
      // so the curated "Other" sentinel carries none and never autofills. The
      // suggestion is a normal selection: fully overridable, never stomps one.
      const targetPath = field.pairs_to;
      const pairWith = opt && opt.pairs_with;
      if (targetPath && pairWith) {
        const targetField = catalogue.getField(targetPath);
        const validTarget = targetField && (targetField.options || []).some((o) => o.key === pairWith);
        const targetUnresolved =
          selections[targetPath] === undefined && selections[targetPath + '.custom'] === undefined;
        // a multi_select target holds an array, so seed it with the single suggestion
        if (validTarget && targetUnresolved) {
          selections[targetPath] = targetField.kind === 'multi_select' ? [pairWith] : pairWith;
        }
      }
      // suggestions — a curated single_select choice can seed screens into a
      // multi_select target. A specific option's `suggests` always fires; a
      // field-level `suggests` fires for ANY concrete vendor pick (an auth provider
      // → "Sign in / sign up") but not the None/Other sentinels.
      applySuggestionList(opt && opt.suggests, selections, catalogue);
      if (option_key !== 'none' && option_key !== CUSTOM_SENTINEL) {
        applySuggestionList(field.suggests, selections, catalogue);
      }
    }
  }

  // sweep downstream selections newly precluded / made non-applicable
  const { selections: next, sweptPaths } = sweepSelections(selections, catalogue);

  const newValue = next[path] !== undefined ? next[path] : null;
  const events = [
    { name: 'selection_recorded', payload: { path, value: newValue, field_kind: field.kind } },
  ];
  if (sweptPaths.length) {
    events.push({ name: 'selection_swept', payload: { swept_paths: sweptPaths, caused_by: path } });
  }

  return { selections: next, events, output: { selection: next[path], swept_paths: sweptPaths } };
}
