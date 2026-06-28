// The policy engine. One role — `author` — and a single user, so there is no
// access control beyond confirmation: every capability is permitted; the only
// policy gate is the destructive-action confirmation requirement.
// (capabilities.yaml :: policies — roles=[author]; reset_draft confirm always,
//  load_sample confirm when overwriting a non-empty draft.)

import { CAPABILITY_GRAPH } from './capabilityGraph.js';
import { isEmptyDraft } from '../state/index.js';

export const ROLES = Object.freeze(['author']);

export function isKnownCapability(capabilityId) {
  return Object.prototype.hasOwnProperty.call(CAPABILITY_GRAPH, capabilityId);
}

/** Single role (author), single user — every capability is permitted. */
export function isPermitted(/* capabilityId, role */) {
  return true;
}

/** Does this capability require a confirmation token under the current draft? */
export function requiresConfirmation(capabilityId, { draft } = {}) {
  const cap = CAPABILITY_GRAPH[capabilityId];
  if (!cap) return false;
  if (cap.confirmation === 'always') return true;
  if (cap.confirmation === 'on_overwrite') return !isEmptyDraft(draft);
  return false;
}
