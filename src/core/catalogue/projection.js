// read_catalogue_view — project the catalogue against current selections. Pure
// read selector: applicable sections -> applicable fields, each option carrying
// a per-option gated flag + reason under the current state. A non-applicable
// FIELD is omitted (hidden); a gated OPTION is included with gated:true (shown
// faded/struck with its reason — never hidden). (capabilities.yaml :: abstract_api_surface)
//
// This builds the field view-model the bespoke <sq-field>/<sq-option> components
// render. No mutation, no persistence, no business decisions beyond reading the
// encoded rules.

import { fieldApplies, sectionApplies, evaluateOptionGate } from './conditions.js';
import { customList, CUSTOM_SENTINEL } from './custom.js';

function isSelected(field, value, key) {
  if (field.kind === 'multi_select') return Array.isArray(value) && value.includes(key);
  return value === key;
}

function isResolved(field, value, customValue) {
  if (field.kind === 'multi_select') {
    if (customList(customValue).length > 0) return true;
    return Array.isArray(value) && value.length > 0;
  }
  if (customValue !== undefined && customValue !== '') return true;
  if (field.kind === 'boolean') return typeof value === 'boolean';
  return value !== undefined && value !== '' && value !== null;
}

// A `custom:true` field exposes a free-text escape hatch behind an explicit
// "Other" option (the sentinel key). The optional input(s) appear only once
// "Other" is picked or a custom value already exists; the typed value lives at
// "<path>.custom" — ONE string for a single_select (mutually exclusive with the
// curated value), or an ARRAY of strings for a multi_select (coexisting, more
// than one allowed). (set_custom_value; src/core/catalogue/custom.js)

/** Project a single field against selections into a render view-model. The
 *  catalogue enables bidirectional option gating (a selection elsewhere can rule
 *  an option here out). */
export function projectField(field, selections, catalogue) {
  // presentation overrides for the vendor-stack pipeline: a field may carry
  // `label_profile` / `note_profile` / `placeholder_profile` variants
  const isProfilePipeline = selections['meta.kind'] === 'profile';
  const text = (key) =>
    isProfilePipeline && field[`${key}_profile`] != null ? field[`${key}_profile`] : field[key];
  const value = selections[field.path];
  const customValue = selections[field.path + '.custom'];
  const isMulti = field.kind === 'multi_select';
  const customValues = isMulti ? customList(customValue) : [];
  const hasCustom = isMulti ? customValues.length > 0 : customValue !== undefined && customValue !== '';
  // the escape hatch is active when the sentinel is chosen or a custom value
  // stands in for it (the curated value clears once free text is committed)
  const customActive = !!field.custom && (isSelected(field, value, CUSTOM_SENTINEL) || hasCustom);
  const options = (field.options || []).map((o) => {
    const gate = evaluateOptionGate(o, selections, field, catalogue);
    return {
      key: o.key,
      label: o.label,
      icon: o.icon || '',
      iconColor: o.iconColor || '',
      // keep the "Other" chip lit while its free-text value stands in for it
      selected: isSelected(field, value, o.key) || (customActive && o.key === CUSTOM_SENTINEL),
      gated: gate.gated,
      reason: gate.reason || '',
    };
  });
  return {
    path: field.path,
    label: text('label'),
    kind: field.kind,
    severity: field.severity,
    primary: !!field.primary,
    // view-model the dumb <sq-field> renders directly: { enabled, multi, value,
    // values } — enabled gates the optional input(s) behind the active escape
    // hatch; multi switches single-input vs repeatable-list rendering
    custom: field.custom
      ? { enabled: customActive, multi: isMulti, value: isMulti ? '' : customValue ?? '', values: customValues }
      : null,
    note: text('note') || '',
    placeholder: text('placeholder') || '',
    value,
    customValue,
    options,
    resolved: isResolved(field, value, customValue),
    applies: true,
  };
}

/** Project the whole catalogue against current selections. A `hidden: true`
 *  field is pipeline state (set by the welcome screen, still serialized) — it
 *  never renders; a section left with nothing to render is omitted entirely.
 *  EXCEPT: a non-applicable section carrying a `guard_note` stays listed as
 *  GUARDED (crosshatched with its reason — never hidden), mirroring the
 *  gated-option treatment at section scale. Its selections still sweep and
 *  never export (applies_when semantics are unchanged). */
export function projectCatalogue(catalogue, selections = {}) {
  const sections = [];
  for (const section of catalogue.sections) {
    if (!sectionApplies(section, selections)) {
      if (section.guard_note) {
        sections.push({
          id: section.id,
          number: section.number,
          title: section.title,
          blurb: section.blurb || '',
          guarded: true,
          guardReason: section.guard_note,
          fields: [],
          resolvedCount: 0,
          fieldCount: 0,
        });
      }
      continue;
    }
    const fields = [];
    for (const field of section.fields || []) {
      if (field.hidden || !fieldApplies(field, selections)) continue;
      fields.push(projectField(field, selections, catalogue));
    }
    if (fields.length === 0) continue;
    const profileBlurb = selections['meta.kind'] === 'profile' && section.blurb_profile != null;
    sections.push({
      id: section.id,
      number: section.number,
      title: section.title,
      blurb: (profileBlurb ? section.blurb_profile : section.blurb) || '',
      guarded: false,
      guardReason: '',
      fields,
      resolvedCount: fields.filter((f) => f.resolved).length,
      fieldCount: fields.length,
    });
  }
  return { sections };
}
