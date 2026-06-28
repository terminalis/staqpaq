// svc.archive.zip — the bundle archiver. The ONLY importer of fflate. Produces a
// standards-compliant zip as a Uint8Array, DETERMINISTIC over identical inputs:
// a fixed mtime + fixed compression level + stable entry order make the bytes
// byte-identical, preserving export_pack's determinism guarantee.
// (service-map.yaml :: services[svc.archive.zip])

import { zipSync, strToU8 } from 'fflate';

// A fixed timestamp so the archive bytes never depend on wall-clock time.
const FIXED_MTIME = new Date('2020-01-01T00:00:00Z');
const LEVEL = 6;

/** Zip a map of { filename: textContent } into a deterministic Uint8Array. */
export function zipArtifacts(files) {
  const entries = {};
  for (const name of Object.keys(files)) {
    entries[name] = [strToU8(files[name]), { mtime: FIXED_MTIME, level: LEVEL }];
  }
  return zipSync(entries, { mtime: FIXED_MTIME, level: LEVEL });
}
