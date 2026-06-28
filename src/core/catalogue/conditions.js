// Pure readers for the catalogue's encoded compatibility rule map.
//
// No state, no persistence, no side effects. These are the "gating read as
// encoded" primitive (capabilities.yaml :: derive_requirements.constraints): a
// gate is RECOMPUTED from the CURRENT selections on every call — it holds NO
// latch. Field applicability and option gating are different behaviors with
// different surface treatment, computed by different functions here.

/** Normalize a selection value to an array of comparable string tokens.
 *  single -> [s]; multi -> members; boolean -> ['true'|'false']; absent -> []. */
export function selectionTokens(value) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (typeof value === 'boolean') return [value ? 'true' : 'false'];
  return [String(value)];
}

/** Does one condition hold against the selections map?
 *  { path, anyOf:[keys] } — selection at path includes/equals any key.
 *  { path, present:true|false } — selection at path is present / absent. */
export function conditionHolds(cond, selections) {
  if (!cond || !cond.path) return false;
  const tokens = selectionTokens(selections ? selections[cond.path] : undefined);
  if (cond.present === true) return tokens.length > 0;
  if (cond.present === false) return tokens.length === 0;
  if (Array.isArray(cond.anyOf)) {
    return cond.anyOf.some((k) => tokens.includes(String(k)));
  }
  return false;
}

/** Is a FIELD applicable under current selections? A non-applicable field is
 *  HIDDEN (vs a gated option, which is shown). applies_when: ALL must hold. */
export function fieldApplies(field, selections) {
  const when = field && field.applies_when;
  if (!Array.isArray(when) || when.length === 0) return true;
  return when.every((c) => conditionHolds(c, selections));
}

/** Is a SECTION applicable under current selections? */
export function sectionApplies(section, selections) {
  const when = section && section.applies_when;
  if (!Array.isArray(when) || when.length === 0) return true;
  return when.every((c) => conditionHolds(c, selections));
}

/** Flatten a catalogue (loader form has `allFields`; raw JSON has `sections`). */
function allFieldsOf(catalogue) {
  if (!catalogue) return [];
  if (catalogue.allFields) return catalogue.allFields;
  return (catalogue.sections || []).flatMap((s) => s.fields || []);
}

/**
 * Reverse (bidirectional) rule-out: an ALREADY-SELECTED option in another field
 * can rule out an option here. "X requires/precludes this field = …" reads both
 * ways — so once X is picked downstream, the upstream keys it can't coexist with
 * become unavailable. For every selected option whose own rule targets `fieldPath`:
 *   * a `requires` of fieldPath ∈ A rules out keys NOT in A;
 *   * a `precludes` of fieldPath ∈ B rules out keys IN B.
 * Returns the conflicting selected option's label (for the reason), or null.
 */
function ruledOutBySelection(fieldPath, optionKey, selections, catalogue) {
  for (const other of allFieldsOf(catalogue)) {
    if (!other || other.path === fieldPath) continue; // a field never constrains itself
    for (const k of selectionTokens(selections ? selections[other.path] : undefined)) {
      const sel = (other.options || []).find((o) => o.key === k);
      if (!sel) continue;
      for (const rule of sel.requires || []) {
        if (rule.path === fieldPath && Array.isArray(rule.anyOf) && !rule.anyOf.includes(optionKey)) {
          return sel.label || k;
        }
      }
      for (const rule of sel.precludes || []) {
        if (rule.path === fieldPath && Array.isArray(rule.anyOf) && rule.anyOf.includes(optionKey)) {
          return sel.label || k;
        }
      }
    }
  }
  return null;
}

/**
 * Evaluate an option's gate against current selections. An option is gated only
 * when an actual selection rules it out — never because something is merely
 * undecided. So a fresh draft strikes out nothing; options gate only once a
 * conflicting choice is made, in EITHER direction:
 *   * forward — a `requires` gates when its upstream field is DECIDED and fails
 *     the rule; a `precludes` gates when its condition HOLDS;
 *   * reverse — an already-selected option elsewhere rules this one out
 *     (bidirectional), requiring `field` + `catalogue` to resolve.
 * Returns { gated:boolean, reason:string|null }. Stateless — recomputed every call.
 */
export function evaluateOptionGate(option, selections, field, catalogue) {
  if (!option) return { gated: false, reason: null };
  for (const rule of option.requires || []) {
    const upstreamDecided = selectionTokens(selections ? selections[rule.path] : undefined).length > 0;
    if (upstreamDecided && !conditionHolds(rule, selections)) {
      return { gated: true, reason: rule.reason || 'Ruled out by the current selection.' };
    }
  }
  for (const rule of option.precludes || []) {
    if (conditionHolds(rule, selections)) {
      return { gated: true, reason: rule.reason || 'Precluded by a conflicting selection.' };
    }
  }
  if (field && catalogue) {
    const by = ruledOutBySelection(field.path, option.key, selections, catalogue);
    if (by) return { gated: true, reason: `Ruled out by your “${by}” selection.` };
  }
  return { gated: false, reason: null };
}
