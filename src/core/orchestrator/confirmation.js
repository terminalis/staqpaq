// Confirmation tokens for destructive capabilities (reset_draft always;
// load_sample when overwriting a non-empty draft). The orchestrator MINTS a
// token when confirmation is required without a valid one (returned to the UI in
// the CONFIRMATION_REQUIRED error), and VERIFIES + consumes it when the user
// confirms. Single-use, bound to the capability. (capabilities.yaml :: policies)

const _pending = new Map(); // token -> capabilityId

function newToken() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'c-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
}

export function mintConfirmation(capabilityId) {
  const t = newToken();
  _pending.set(t, capabilityId);
  return t;
}

/** True iff `token` is a live token minted for `capabilityId`. Consumes it. */
export function verifyConfirmation(token, capabilityId) {
  if (!token || !_pending.has(token)) return false;
  const ok = _pending.get(token) === capabilityId;
  if (ok) _pending.delete(token); // single-use
  return ok;
}
