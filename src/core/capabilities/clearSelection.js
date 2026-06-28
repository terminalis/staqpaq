// clear_selection — remove a previously recorded decision at a dot-path (explicit
// deselect). For multi_select, an option_key removes a single member; omitted
// clears the whole field. Clearing re-evaluates gating (options it precluded are
// automatically re-enabled, since gates are recomputed) and sweeps any downstream
// selections it had enabled. (capabilities.yaml :: clear_selection flow)

import { sweepSelections } from '../gating/sweep.js';

export function clearSelection(ctx, input) {
  const { catalogue, draft } = ctx;
  const { path, option_key } = input || {};

  const field = catalogue.getField(path);
  if (!field) return { error: { code: 'UNKNOWN_PATH', path } };

  const selections = { ...draft.selections };
  const customKey = path + '.custom';
  let cleared = false;
  let removedMember;

  if (field.kind === 'multi_select' && option_key !== undefined && Array.isArray(selections[path])) {
    const arr = selections[path].filter((k) => k !== option_key);
    if (arr.length !== selections[path].length) {
      cleared = true;
      removedMember = option_key;
      if (arr.length === 0) delete selections[path];
      else selections[path] = arr;
    }
  } else {
    if (selections[path] !== undefined) { delete selections[path]; cleared = true; }
    if (selections[customKey] !== undefined) { delete selections[customKey]; cleared = true; }
    // a full clear is a fresh start — forget which suggestions were dismissed here,
    // so upstream choices can seed this field again
    if (selections[path + '.dismissed'] !== undefined) delete selections[path + '.dismissed'];
  }

  // Clearing may re-enable options precluded only by this field (automatic — gates
  // recomputed) and orphans any downstream selections it had enabled → sweep.
  const { selections: next, sweptPaths } = sweepSelections(selections, catalogue);

  const events = [];
  if (cleared) {
    const payload = { path };
    if (removedMember !== undefined) payload.removed_member = removedMember;
    events.push({ name: 'selection_cleared', payload });
  }
  if (sweptPaths.length) {
    events.push({ name: 'selection_swept', payload: { swept_paths: sweptPaths, caused_by: path } });
  }

  return { selections: next, events, output: { cleared } };
}
