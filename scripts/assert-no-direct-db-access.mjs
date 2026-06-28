#!/usr/bin/env node
// assert-no-direct-db-access
//
// No file OUTSIDE the orchestrator and its owned state module reaches the
// persistence layer. Mechanically:
//   * the vendored idb-keyval library is imported ONLY by src/core/state/**;
//   * the state module (src/core/state/**) is imported ONLY by the orchestrator
//     (src/core/orchestrator/**) or by the state module itself.
// So src/ui/**, capability handlers, the catalogue/data loaders, and tests
// never touch persistence directly — capabilities receive state and RETURN new
// state; the orchestrator's persist step performs the write.

import { join } from 'node:path';
import {
  ROOT, walk, rawSpecifiers, resolveSpecifier, relPosix, under, isIdbKeyval, finish,
} from './_lib.mjs';

const STATE_DIR = 'src/core/state';
const ORCH_DIR = 'src/core/orchestrator';
const violations = [];

for (const file of walk(join(ROOT, 'src'))) {
  const rf = relPosix(file);
  const inState = under(rf, STATE_DIR);
  const inOrch = under(rf, ORCH_DIR);

  for (const spec of rawSpecifiers(file)) {
    const r = resolveSpecifier(file, spec);

    if (isIdbKeyval(r)) {
      if (!inState) {
        violations.push(
          `${rf} imports 'idb-keyval' — only the persistence adapter under src/core/state/** may access the store`,
        );
      }
      continue;
    }
    if (r.kind === 'file' && under(relPosix(r.path), STATE_DIR)) {
      if (!inState && !inOrch) {
        violations.push(
          `${rf} imports the persistence adapter ('${spec}' -> ${relPosix(r.path)}) — only the orchestrator + state module may reach src/core/state/**`,
        );
      }
    }
  }
}

finish('assert-no-direct-db-access', violations);
