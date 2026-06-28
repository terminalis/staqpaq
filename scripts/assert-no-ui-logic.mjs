#!/usr/bin/env node
// assert-no-ui-logic
//
// Files under src/ui/** (the presentation layer) hold NO authority. The
// load-bearing, statically-checkable rule is: the UI MUST NOT import the state
// module (src/core/state/**) and MUST NOT import the persistence library
// (idb-keyval) directly.
//
// What the UI MAY do (and this assertion deliberately does NOT flag): hold view
// state, call the single orchestrator entry / façade to REQUEST mutations, and
// call PURE read/derive functions (derive, the staqpaq.yaml serializer) to
// RENDER the canonically-inert live preview. The line is authority, not
// richness — see the precision_note in foundation.yaml.

import { join } from 'node:path';
import {
  ROOT, walk, rawSpecifiers, resolveSpecifier, relPosix, under, isIdbKeyval, finish,
} from './_lib.mjs';

const STATE_DIR = 'src/core/state';
const violations = [];

for (const file of walk(join(ROOT, 'src', 'ui'))) {
  const rf = relPosix(file);
  for (const spec of rawSpecifiers(file)) {
    const r = resolveSpecifier(file, spec);

    if (isIdbKeyval(r)) {
      violations.push(
        `${rf} imports the persistence library directly ('${spec}') — the UI holds no persistence authority`,
      );
      continue;
    }
    if (r.kind === 'file' && under(relPosix(r.path), STATE_DIR)) {
      violations.push(
        `${rf} imports the state module ('${spec}' -> ${relPosix(r.path)}) — the UI must not touch the persistence / canonical-state module`,
      );
    }
  }
}

finish('assert-no-ui-logic', violations);
