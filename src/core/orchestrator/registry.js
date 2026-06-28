// The capability handler registry. Handlers are registered by registerCapabilities.js
// (the only place capability modules are imported) and looked up by runIntent.
//
// Handler contract (every capability handler):
//   handler(ctx, input) -> { error?, selections?, events?, output? }
//     ctx     = { catalogue, draft }   (read-only current state + loaded catalogue)
//     error   = { code, ... }          a frozen error code (UNKNOWN_PATH, OPTION_GATED, …)
//     selections = object              the NEW full selections map (present iff it mutates)
//     events  = [{ name, payload }]    events to emit
//     output  = any                    the capability's return value
//   Handlers are pure w.r.t. persistence — they NEVER write state; the
//   orchestrator's persist + emit steps do (assert-no-direct-db-access).

const _handlers = new Map();
let _sealed = false;

export function registerHandler(id, handler) {
  if (_sealed) throw new Error(`handler registry is sealed; cannot register '${id}'`);
  if (_handlers.has(id)) throw new Error(`handler '${id}' is already registered`);
  _handlers.set(id, handler);
}

export function sealRegistry() {
  _sealed = true;
}

export function getHandler(id) {
  return _handlers.get(id) || null;
}

export function hasHandler(id) {
  return _handlers.has(id);
}

export function registeredIds() {
  return [..._handlers.keys()];
}
