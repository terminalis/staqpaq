// The canonical BuildSpec model (capabilities.yaml :: entities[type=build_spec]).
// Fields are EXACTLY: id (uuid), selections (map of dot-path -> resolved value),
// created_at, updated_at. No field added, renamed, or dropped. Pure — no
// persistence, no side effects. The invariants (no empties, valid option keys,
// custom-only-where-allowed, no gated selection, never stores derived/UI data)
// are enforced by the capabilities / orchestrator, not here.

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // defensive fallback when crypto.randomUUID is unavailable
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function nowISO() {
  return new Date().toISOString();
}

/** A fresh BuildSpec aggregate. id_strategy = uuid; created_at + updated_at set now. */
export function createBuildSpec(selections = {}) {
  const t = nowISO();
  return { id: uuid(), selections: { ...selections }, created_at: t, updated_at: t };
}

/** A new spec with replaced selections; preserves id + created_at; stamps
 *  updated_at (the orchestrator's persist step is the single mutation point). */
export function withSelections(spec, selections) {
  return {
    id: spec.id,
    selections: { ...selections },
    created_at: spec.created_at,
    updated_at: nowISO(),
  };
}

/** True when a spec has no resolved decisions. */
export function isEmptyDraft(spec) {
  return !spec || !spec.selections || Object.keys(spec.selections).length === 0;
}
