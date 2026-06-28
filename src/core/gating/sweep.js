// The gating + sweep engine. Reads the catalogue's encoded rule map "as encoded"
// and recomputes from the CURRENT selections on every call — it holds NO latch.
// (capabilities.yaml :: record_selection / clear_selection flows + invariants)
//
// sweepSelections removes any selection that is no longer permitted after a
// mutation:
//   * a selection whose FIELD is no longer active — its section became
//     non-applicable OR its own applies_when fails — its value AND any custom
//     value are cleared (the field is hidden; its decision is no longer active —
//     "downstream selections it had enabled" / "never silently retained");
//   * an OPTION that became gated (requires/precludes) — for multi_select the
//     gated member is removed; for a single-valued option field the whole field
//     is cleared.
// It iterates to a fixpoint (clearing only ever REMOVES selections, so it
// terminates), supporting cascade sweeps. Returns { selections, sweptPaths }.

import { fieldApplies, sectionApplies, evaluateOptionGate } from '../catalogue/conditions.js';

function isSingleOptionKind(kind) {
  return kind === 'single_select';
}

export function sweepSelections(selections, catalogue) {
  const current = { ...selections };
  const swept = new Set();
  let changed = true;

  while (changed) {
    changed = false;
    for (const section of catalogue.sections) {
      const secApplies = sectionApplies(section, current);
      for (const field of section.fields || []) {
        const path = field.path;
        const customKey = path + '.custom';
        const dismissedKey = path + '.dismissed';
        const hasValue = current[path] !== undefined;
        const hasCustom = current[customKey] !== undefined;
        const hasDismissed = current[dismissedKey] !== undefined;
        if (!hasValue && !hasCustom && !hasDismissed) continue;

        // activity sweep — a hidden field's decision is no longer active (its
        // custom free text and dismissed-suggestion memory go with it)
        if (!secApplies || !fieldApplies(field, current)) {
          if (hasValue) delete current[path];
          if (hasCustom) delete current[customKey];
          if (hasDismissed) delete current[dismissedKey];
          swept.add(path);
          changed = true;
          continue;
        }

        // gating sweep — only option-based kinds can be gated; custom/free values
        // are opaque and never gated.
        if (!hasValue) continue;
        const value = current[path];
        if (field.kind === 'multi_select' && Array.isArray(value)) {
          const kept = value.filter((k) => {
            const opt = (field.options || []).find((o) => o.key === k);
            return !opt || !evaluateOptionGate(opt, current, field, catalogue).gated;
          });
          if (kept.length !== value.length) {
            if (kept.length === 0) delete current[path];
            else current[path] = kept;
            swept.add(path);
            changed = true;
          }
        } else if (isSingleOptionKind(field.kind)) {
          const opt = (field.options || []).find((o) => o.key === value);
          if (opt && evaluateOptionGate(opt, current, field, catalogue).gated) {
            delete current[path];
            swept.add(path);
            changed = true;
          }
        }
      }
    }
  }

  return { selections: current, sweptPaths: [...swept] };
}
