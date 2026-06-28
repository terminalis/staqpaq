// The persistence adapter SEAM. Everything outside src/core/state/** reaches
// canonical state only through this module, and only the orchestrator imports it
// (assert-no-direct-db-access). The access library (idb-keyval) lives behind it.

export { bootState, getDraft, getEvents, commitSelections, appendEvents } from './store.js';
export { createBuildSpec, withSelections, isEmptyDraft } from './buildSpec.js';
