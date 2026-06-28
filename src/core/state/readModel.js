// Defensive read-model snapshots for canonical state. Readers get detached,
// frozen data so accidental UI/orchestrator consumer mutation cannot alter the
// in-memory aggregate by reference.

function cloneValue(value) {
  if (value === undefined || value === null || typeof value !== 'object') return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

export function readModel(value) {
  return deepFreeze(cloneValue(value));
}
