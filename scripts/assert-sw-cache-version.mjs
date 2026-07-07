#!/usr/bin/env node
// assert-sw-cache-version
//
// The service worker serves shell files cache-first, so installed PWAs only
// pick up a deploy when sw.js itself byte-changes (new CACHE_VERSION → new
// worker → fresh cache). A deploy that edits shell files without touching
// sw.js strands installed clients on the old version. This assert makes the
// bump mechanical: CACHE_VERSION must end in an 8-hex digest of the current
// SHELL_PATHS file contents, so any shell change fails the suite until sw.js
// is updated — and updating sw.js is itself the byte-diff that ships the
// update. Run with --fix (npm run sync:sw) to write the digest in place;
// without it (CI) the script only checks.
//
// Text files are hashed with CRLF normalized to LF so autocrlf checkouts
// (Windows working trees) and LF checkouts (CI) agree on the digest.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, finish } from './_lib.mjs';

const FIX = process.argv.includes('--fix');
const violations = [];
const workerPath = join(ROOT, 'sw.js');
const TEXT_EXTS = ['.html', '.js', '.mjs', '.css', '.json', '.svg', '.webmanifest'];

function shellDigest(paths) {
  // './' is the navigation alias for index.html, which is listed on its own.
  const files = [...new Set(paths.map((p) => (p === './' ? './index.html' : p)))];
  const hash = createHash('sha256');
  for (const path of files) {
    const abs = join(ROOT, path);
    if (!existsSync(abs)) {
      violations.push(`SHELL_PATHS entry '${path}' does not exist in the repository`);
      continue;
    }
    let bytes = readFileSync(abs);
    if (TEXT_EXTS.some((ext) => path.endsWith(ext))) {
      bytes = Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
    }
    hash.update(path);
    hash.update(Buffer.from([0]));
    hash.update(bytes);
    hash.update(Buffer.from([0]));
  }
  return hash.digest('hex').slice(0, 8);
}

if (!existsSync(workerPath)) {
  violations.push('sw.js must exist at the repository root');
} else {
  const worker = readFileSync(workerPath, 'utf8');
  const versionMatch = worker.match(/CACHE_VERSION = '(staqpaq-shell-v\d+)-([0-9a-f]{8})'/);
  const shellMatch = worker.match(/SHELL_PATHS\s*=\s*Object\.freeze\(\s*(\[[\s\S]*?\])\s*\)/);
  if (!versionMatch) {
    violations.push("sw.js CACHE_VERSION must look like 'staqpaq-shell-v<N>-<8-hex shell digest>'");
  }
  if (!shellMatch) {
    violations.push('sw.js must declare SHELL_PATHS as a frozen literal list');
  }
  if (versionMatch && shellMatch) {
    const shellPaths = JSON.parse(shellMatch[1].replace(/'/g, '"'));
    const expected = shellDigest(shellPaths);
    if (versionMatch[2] !== expected) {
      if (FIX && !violations.length) {
        // Safe to write in place: sw.js is not in SHELL_PATHS, so writing it
        // does not change the digest it must carry.
        writeFileSync(
          workerPath,
          worker.replace(versionMatch[0], `CACHE_VERSION = '${versionMatch[1]}-${expected}'`),
        );
        console.log(`✓ assert-sw-cache-version --fix wrote CACHE_VERSION = '${versionMatch[1]}-${expected}'`);
      } else {
        violations.push(
          `CACHE_VERSION digest is stale (a SHELL_PATHS file changed): run ` +
          `'npm run sync:sw', or set CACHE_VERSION = '${versionMatch[1]}-${expected}' in sw.js`,
        );
      }
    }
  }
}

finish('assert-sw-cache-version', violations);
