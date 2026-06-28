// Free-text "Other" values. A multi_select custom field can carry MORE THAN ONE
// free-text entry — stored as an array of strings at "<path>.custom"; a
// single_select custom field (or a legacy draft) stores ONE string. customList
// normalises either shape to a clean string[] (blanks dropped) so every reader is
// array-aware and old single-string drafts keep working without a migration.

/** The catalogue's free-text escape-hatch sentinel option (see projection.js). */
export const CUSTOM_SENTINEL = 'other';

/** Normalise a raw "<path>.custom" value (undefined | string | string[]) to a
 *  trimmed-of-blanks string[]. A single string becomes a one-item list. */
export function customList(value) {
  if (value === undefined || value === null) return [];
  const arr = Array.isArray(value) ? value : [value];
  return arr.map((v) => (v == null ? '' : String(v))).filter((s) => s !== '');
}
