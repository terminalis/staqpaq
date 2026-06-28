// reset_draft — clear all selections back to an empty draft (start new). The
// orchestrator's confirmation step ALWAYS requires a valid token (destructive).
// The resulting state is empty — no residual keys. Emits draft_reset.
// (capabilities.yaml :: reset_draft)

export function resetDraft() {
  return {
    selections: {}, // empty — the orchestrator persists the whole (empty) aggregate
    events: [{ name: 'draft_reset', payload: {} }],
    output: { reset: true },
  };
}
