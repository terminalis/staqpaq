#!/usr/bin/env node
// assert-single-orchestrator
//
// Every capability (record_selection, clear_selection, set_custom_value,
// derive_requirements, export_pack, load_sample, reset_draft) is invoked ONLY
// through src/core/orchestrator/runIntent.js. Mechanically: capability handler
// modules under src/core/capabilities/** may be imported ONLY by the
// orchestrator (src/core/orchestrator/**) — never from src/ui/**, the data
// loaders, derive/export, or tests. That guarantees the single mutation path.

import { join } from 'node:path';
import {
  ROOT, walk, rawSpecifiers, resolveSpecifier, relPosix, under, finish,
} from './_lib.mjs';

const ORCH_DIR = 'src/core/orchestrator';
const CAPS_DIR = 'src/core/capabilities';
const violations = [];

for (const file of walk(join(ROOT, 'src'))) {
  const rf = relPosix(file);
  if (under(rf, ORCH_DIR)) continue; // the orchestrator owns the capability registry

  for (const spec of rawSpecifiers(file)) {
    const r = resolveSpecifier(file, spec);
    if (r.kind === 'file' && under(relPosix(r.path), CAPS_DIR)) {
      violations.push(
        `${rf} imports a capability handler directly ('${spec}' -> ${relPosix(r.path)}) — capabilities run only through src/core/orchestrator/runIntent.js`,
      );
    }
  }
}

finish('assert-single-orchestrator', violations);
