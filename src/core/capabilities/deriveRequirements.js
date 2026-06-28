// derive_requirements (capability wrapper). A pure query — mutates nothing,
// emits nothing. The orchestrator returns its output without persisting. The
// optional input.section_id may scope a caller's view; the derivation itself is
// global (its readiness.per_section already carries per-section breakdowns).
// (capabilities.yaml :: derive_requirements)

import { deriveRequirements } from '../derive/deriveRequirements.js';

export function deriveRequirementsCapability(ctx /* , input */) {
  return { output: deriveRequirements(ctx.draft.selections, ctx.catalogue) };
}
