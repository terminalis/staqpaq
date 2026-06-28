// runIntent — THE single orchestrator entry. Every capability is invoked only
// through here (assert-single-orchestrator). It executes the seven invariant
// steps in order (capabilities.yaml :: orchestrator_contract.invariant_steps):
//
//   validate → enforce policy → enforce confirmation → execute → persist → emit → return
//
// Logic-layer posture = deterministic executor. The handler does the capability-
// specific work and returns { error?, selections?, events?, output? }; the
// orchestrator (and only the orchestrator, through its owned state module)
// persists the new aggregate and appends the events.

import './registerCapabilities.js'; // side-effect: register all built handlers
import { isKnownCapability, isPermitted, requiresConfirmation } from './policy.js';
import { getHandler } from './registry.js';
import { mintConfirmation, verifyConfirmation } from './confirmation.js';
import { getCatalogue } from '../catalogue/loader.js';
import { getDraft, commitSelections, appendEvents } from '../state/index.js';

/**
 * @param {{ capabilityId: string, input?: object, confirmationToken?: string }} req
 * @returns {Promise<{ ok: boolean, result?: any, error?: { code: string } }>}
 */
export async function runIntent({ capabilityId, input = {}, confirmationToken } = {}) {
  // 1 · validate — capabilityId must be a known capability; input must be an object
  if (!isKnownCapability(capabilityId)) {
    throw new Error(`runIntent: unknown capability '${capabilityId}'`);
  }
  const safeInput = input && typeof input === 'object' ? input : {};

  // 2 · enforce policy — single role (author); every capability permitted
  if (!isPermitted(capabilityId, 'author')) {
    return { ok: false, error: { code: 'NOT_PERMITTED' } };
  }

  // 3 · enforce confirmation — destructive actions need a valid, single-use token
  if (requiresConfirmation(capabilityId, { draft: getDraft() })) {
    if (!confirmationToken || !verifyConfirmation(confirmationToken, capabilityId)) {
      return {
        ok: false,
        error: { code: 'CONFIRMATION_REQUIRED', confirmationToken: mintConfirmation(capabilityId) },
      };
    }
  }

  // 4 · execute — the registered handler does capability-specific validation + work
  const handler = getHandler(capabilityId);
  if (!handler) {
    throw new Error(`runIntent: no handler registered for '${capabilityId}'`);
  }
  const ctx = { catalogue: getCatalogue(), draft: getDraft() };
  const outcome = (await handler(ctx, safeInput)) || {};

  if (outcome.error) {
    return { ok: false, error: outcome.error };
  }

  // 5 · persist — write through the new whole aggregate (only when it mutates)
  if (outcome.selections !== undefined) {
    await commitSelections(outcome.selections);
  }

  // 6 · emit — append events for every meaningful state change
  if (outcome.events && outcome.events.length) {
    await appendEvents(outcome.events);
  }

  // 7 · return
  return { ok: true, result: outcome.output };
}
