// Registers every capability handler into the orchestrator registry. This is the
// ONLY module that imports capability handler modules (src/core/capabilities/**),
// and it lives under src/core/orchestrator/** so assert-single-orchestrator
// permits it. Importing this module (side-effect) registers all handlers that
// have been built; runIntent imports it once.
//
// Handlers are wired here as they are built, per the build sequence:
//   Step 6 — record_selection, clear_selection, set_custom_value
//   Step 7 — derive_requirements
//   Step 8 — export_pack
//   Step 9 — load_sample, reset_draft

import { registerHandler, sealRegistry } from './registry.js';
import { recordSelection } from '../capabilities/recordSelection.js';
import { clearSelection } from '../capabilities/clearSelection.js';
import { setCustomValue } from '../capabilities/setCustomValue.js';
import { deriveRequirementsCapability } from '../capabilities/deriveRequirements.js';
import { exportPack } from '../capabilities/exportPack.js';
import { loadSample } from '../capabilities/loadSample.js';
import { resetDraft } from '../capabilities/resetDraft.js';

registerHandler('record_selection', recordSelection);
registerHandler('clear_selection', clearSelection);
registerHandler('set_custom_value', setCustomValue);
registerHandler('derive_requirements', deriveRequirementsCapability);
registerHandler('export_pack', exportPack);
registerHandler('load_sample', loadSample);
registerHandler('reset_draft', resetDraft);
sealRegistry();
