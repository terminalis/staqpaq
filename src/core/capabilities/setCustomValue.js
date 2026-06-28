// set_custom_value — record a free-text value (the escape hatch). Two roles:
//   * a custom-enabled curated field (custom:true) — the value is stored at
//     "<path>.custom", mutually exclusive with the curated value at "<path>";
//   * a free-value kind (text / color) — the value IS the field's value, stored
//     at "<path>".
// Custom / free values are opaque: they drive no env vars, provider implications,
// or gating. (capabilities.yaml :: set_custom_value; entities.build_spec notes —
// custom -> string at "<path>.custom"; color/text -> string at "<path>")

import { sweepSelections } from '../gating/sweep.js';
import { customList } from '../catalogue/custom.js';

export function setCustomValue(ctx, input) {
  const { catalogue, draft } = ctx;
  const { path, value, values } = input || {};

  const field = catalogue.getField(path);
  if (!field) return { error: { code: 'UNKNOWN_PATH', path } };

  const isFreeKind = field.kind === 'text' || field.kind === 'color';
  const isCustomEnabled = !!field.custom;
  if (!isFreeKind && !isCustomEnabled) {
    return { error: { code: 'CUSTOM_NOT_ALLOWED', path } };
  }

  const selections = { ...draft.selections };
  const customKey = path + '.custom';
  // committed/output value for events: a string for single/free, an array for multi
  let committed;

  if (isFreeKind) {
    // text / color — the free value IS the field's value
    const str = value == null ? '' : String(value);
    if (str === '') delete selections[path];
    else selections[path] = str;
    committed = str;
  } else if (field.kind === 'multi_select') {
    // multi_select custom escape hatch — MORE THAN ONE free-text entry is allowed,
    // stored as an array at "<path>.custom", coexisting with the picked options.
    // The UI owns add/edit/remove rows and sends the whole list (`values`); a lone
    // `value` is accepted as a one-item list for back-compat.
    const list = customList(values !== undefined ? values : value);
    if (list.length === 0) delete selections[customKey];
    else selections[customKey] = list;
    committed = list;
  } else {
    // single_select custom hatch — ONE free value, mutually exclusive with the
    // curated value at "<path>".
    const str = value == null ? '' : String(value);
    if (selections[path] !== undefined) delete selections[path];
    if (str === '') delete selections[customKey];
    else selections[customKey] = str;
    committed = str;
  }

  // Clearing a curated value (mutual exclusion) can orphan downstream selections
  // that required it → sweep to preserve the "no gated selection retained"
  // invariant. selection_swept is emitted when that occurs (a meaningful state
  // change), alongside custom_value_set.
  const { selections: next, sweptPaths } = sweepSelections(selections, catalogue);

  const events = [{ name: 'custom_value_set', payload: { path, value: committed } }];
  if (sweptPaths.length) {
    events.push({ name: 'selection_swept', payload: { swept_paths: sweptPaths, caused_by: path } });
  }

  return { selections: next, events, output: { value: committed } };
}
