// The in-process invocation façade — realizes capabilities.yaml ::
// abstract_api_surface as function calls and pure read selectors. There is NO
// HTTP transport (stack.yaml :: backend_runtime = none); this is an in-process
// façade, not a server API. invoke_intent routes through the single orchestrator;
// every read selector mutates nothing.
//
// This is the seam the UI imports. The UI never imports the state module, the
// capability handlers, or the persistence library — only this façade (plus pure
// read/derive/serialize modules) — keeping the authority line intact.

import { runIntent } from './runIntent.js';
import { loadCatalogue, getCatalogue } from '../catalogue/loader.js';
import { projectCatalogue } from '../catalogue/projection.js';
import { deriveRequirements } from '../derive/deriveRequirements.js';
import { serializeYaml } from '../export/serializeYaml.js';
import { bootState, getDraft, getEvents } from '../state/index.js';

let _booting = null;

/** Boot the logic layer once: load the catalogue + hydrate persisted state. */
export function boot() {
  if (!_booting) {
    _booting = loadCatalogue().then((catalogue) => bootState(catalogue)).then(() => true);
  }
  return _booting;
}

// --- abstract_api_surface ---------------------------------------------------

/** invoke_intent → runIntent. The single mutation path. */
export function invokeIntent(capabilityId, input = {}, confirmationToken) {
  return runIntent({ capabilityId, input, confirmationToken });
}

/** read_entity → the canonical BuildSpec. */
export function readEntity() {
  return getDraft();
}

/** read_catalogue_view → the catalogue projected against current state. */
export function readCatalogueView() {
  return projectCatalogue(getCatalogue(), getDraft().selections);
}

/** read_requirements → the derived read-model (required assets, implied env vars,
 *  provider implications, missing decisions, readiness). Pure — the SAME
 *  derivation export_pack re-runs at commit. */
export function readRequirements() {
  return deriveRequirements(getDraft().selections, getCatalogue());
}

/** The live staqpaq.yaml PREVIEW string — the SAME pure serializer export_pack
 *  re-runs at commit. A canonically-inert projection for display only; the UI
 *  must never hand it back to export_pack (assert-inert-interactive-surface). */
export function readPreviewYaml() {
  return serializeYaml(getDraft().selections, getCatalogue());
}

/** read_events → the event log. */
export function readEvents() {
  return getEvents();
}
