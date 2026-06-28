#!/usr/bin/env node
// test-orchestrator-guards - focused regressions for internal guardrails:
// read-models must not expose mutable canonical state, and capability
// registration must reject duplicates / late writes once sealed.

import { createBuildSpec } from '../src/core/state/buildSpec.js';
import * as registry from '../src/core/orchestrator/registry.js';
const readModelModule = await import('../src/core/state/readModel.js').catch(() => null);

let pass = 0;
const failures = [];
const check = (name, cond) => (cond ? pass++ : failures.push(name));

const readModel = readModelModule && readModelModule.readModel;
check('readModel helper exists', typeof readModel === 'function');
const canonical = createBuildSpec({ project: { name: 'Original' } });
const first = typeof readModel === 'function' ? readModel(canonical) : canonical;
let writeRejected = false;
try {
  first.selections.__mutation_probe = true;
} catch {
  writeRejected = true;
}
const second = typeof readModel === 'function' ? readModel(canonical) : canonical;
check('readModel output is immutable or detached',
  writeRejected || second.selections.__mutation_probe === undefined);

const handler = () => ({ output: true });
registry.registerHandler('__guard_probe__', handler);
let duplicateRejected = false;
try {
  registry.registerHandler('__guard_probe__', handler);
} catch {
  duplicateRejected = true;
}
check('registry rejects duplicate handler ids', duplicateRejected);

check('registry exports sealRegistry', typeof registry.sealRegistry === 'function');
if (typeof registry.sealRegistry === 'function') {
  registry.sealRegistry();
}
let sealedRejected = false;
try {
  registry.registerHandler('__guard_late_probe__', handler);
} catch {
  sealedRejected = true;
}
check('registry rejects late registration after sealing', sealedRejected);

if (failures.length) {
  console.error(`x test-orchestrator-guards FAILED - ${failures.length} of ${pass + failures.length}:`);
  for (const f of failures) console.error('    - ' + f);
  process.exit(1);
}
console.log(`ok test-orchestrator-guards passed - ${pass} checks (immutable reads, registry sealing)`);
