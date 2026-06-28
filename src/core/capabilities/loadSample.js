// load_sample — replace the working draft with the curated sample fixture so the
// loop can be exercised end-to-end. The fixture is the catalogue's presentation-
// only sample (catalogue-valid + ungated by construction — validated at load).
// The orchestrator's confirmation step requires a valid token ONLY when a
// non-empty draft would be overwritten. Emits sample_loaded.
// (capabilities.yaml :: load_sample)

export function loadSample(ctx /* , input */) {
  const fixture = (ctx.catalogue && ctx.catalogue.sampleSelections) || {};
  const selections = { ...fixture };
  const selection_count = new Set(
    Object.keys(selections).map((k) =>
      k.endsWith('.custom') ? k.slice(0, -7) : k.endsWith('.dismissed') ? k.slice(0, -10) : k,
    ),
  ).size;

  return {
    selections, // replace the ENTIRE working state with the fixture
    events: [{ name: 'sample_loaded', payload: { selection_count } }],
    output: { loaded: true },
  };
}
