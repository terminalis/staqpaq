// The capability graph — the source of truth for which capabilities exist and
// their orchestration metadata (derived from capabilities.yaml :: policies +
// orchestrator_contract). Handlers attach to these ids via the registry; this
// graph is pure data (no handlers, no logic). Frozen.
//
//   mutates       — does the capability change canonical state? (drives persist)
//   confirmation  — 'none' | 'always' | 'on_overwrite' (drives the confirmation step)
//   emits         — the event names this capability may emit (for reference)

export const CAPABILITY_GRAPH = Object.freeze({
  record_selection: Object.freeze({ id: 'record_selection', mutates: true, confirmation: 'none', emits: ['selection_recorded', 'selection_swept'] }),
  clear_selection: Object.freeze({ id: 'clear_selection', mutates: true, confirmation: 'none', emits: ['selection_cleared', 'selection_swept'] }),
  set_custom_value: Object.freeze({ id: 'set_custom_value', mutates: true, confirmation: 'none', emits: ['custom_value_set'] }),
  derive_requirements: Object.freeze({ id: 'derive_requirements', mutates: false, confirmation: 'none', emits: [] }),
  export_pack: Object.freeze({ id: 'export_pack', mutates: false, confirmation: 'none', emits: ['pack_exported'] }),
  load_sample: Object.freeze({ id: 'load_sample', mutates: true, confirmation: 'on_overwrite', emits: ['sample_loaded'] }),
  reset_draft: Object.freeze({ id: 'reset_draft', mutates: true, confirmation: 'always', emits: ['draft_reset'] }),
});

export const CAPABILITY_IDS = Object.freeze(Object.keys(CAPABILITY_GRAPH));
