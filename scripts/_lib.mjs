// Shared utilities for the boundary-assertion scripts.
//
// No build step, no dependencies — plain Node ESM. These helpers parse the
// STATIC ESM import graph of the repository (src/** authored modules) so the
// boundary assertions can enforce the architecture authority line. The scripts
// and directory conventions are the boundary; no TypeScript path aliases exist.
//
// This module lives under scripts/** and is never part of the app's import
// graph — the assertions only ever scan src/** and the two root handoff files.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative, sep } from 'node:path';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Convert an OS path to forward-slash form. */
export function toPosix(p) {
  return p.split(sep).join('/');
}

/** Repo-root-relative POSIX path for an absolute path. */
export function relPosix(absPath) {
  return toPosix(relative(ROOT, absPath));
}

/** True when `relPath` is `dirPrefix` itself or sits underneath it. */
export function under(relPath, dirPrefix) {
  return relPath === dirPrefix || relPath.startsWith(dirPrefix + '/');
}

/** Recursively list files under `dir` (absolute) matching `exts`. */
export function walk(dir, exts = ['.js', '.mjs']) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full, exts));
    else if (exts.some((e) => name.endsWith(e))) out.push(full);
  }
  return out;
}

// --- import-map awareness ---------------------------------------------------
// Bare specifiers (lit / idb-keyval / fflate) resolve via the <script
// type="importmap"> declared in index.html, exactly as the browser resolves
// them at runtime. Parsing the same map keeps the assertions in lockstep with
// the deployed runtime.
let _importMap = null;
export function importMap() {
  if (_importMap) return _importMap;
  _importMap = {};
  const indexPath = join(ROOT, 'index.html');
  if (existsSync(indexPath)) {
    const html = readFileSync(indexPath, 'utf8');
    const m = html.match(
      /<script[^>]*type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/i,
    );
    if (m) {
      try {
        const parsed = JSON.parse(m[1]);
        if (parsed && parsed.imports) _importMap = parsed.imports;
      } catch {
        /* malformed map → treat as empty; bare specifiers stay unresolved */
      }
    }
  }
  return _importMap;
}

// --- import extraction ------------------------------------------------------
function stripComments(src) {
  // Remove block comments, then line comments (but never a `://` in a URL).
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const FROM_RE = /(?:^|[\s;])(?:import|export)\b[\s\S]*?\bfrom\s*["']([^"']+)["']/g;
const SIDE_EFFECT_RE = /(?:^|[\s;])import\s*["']([^"']+)["']/g;
const DYNAMIC_RE = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

/** The raw import specifier strings referenced by a source file. */
export function rawSpecifiers(file) {
  const src = stripComments(readFileSync(file, 'utf8'));
  const specs = new Set();
  for (const re of [FROM_RE, SIDE_EFFECT_RE, DYNAMIC_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) specs.add(m[1]);
  }
  return [...specs];
}

function withCandidateExt(absBase) {
  if (existsSync(absBase) && statSync(absBase).isFile()) return absBase;
  for (const ext of ['.js', '.mjs']) {
    if (existsSync(absBase + ext)) return absBase + ext;
  }
  const idx = join(absBase, 'index.js');
  if (existsSync(idx)) return idx;
  return absBase; // best-effort normalized path even if it does not exist
}

/**
 * Resolve an import specifier referenced from `fromFile`.
 * Returns one of:
 *   { kind: 'file', path, bare? }  — resolved to a concrete repo file path
 *   { kind: 'bare', spec }         — an unmapped bare specifier
 */
export function resolveSpecifier(fromFile, spec) {
  const map = importMap();
  if (Object.prototype.hasOwnProperty.call(map, spec)) {
    // import-map targets resolve against the document base (repo root).
    const t = map[spec];
    const base = t.startsWith('/')
      ? join(ROOT, t.slice(1))
      : resolve(ROOT, t);
    return { kind: 'file', path: withCandidateExt(base), bare: spec };
  }
  if (spec.startsWith('.') || spec.startsWith('/')) {
    const base = spec.startsWith('/')
      ? join(ROOT, spec.slice(1))
      : resolve(dirname(fromFile), spec);
    return { kind: 'file', path: withCandidateExt(base) };
  }
  return { kind: 'bare', spec };
}

/** True when a resolved import points at the vendored idb-keyval library. */
export function isIdbKeyval(resolved) {
  if (resolved.bare === 'idb-keyval') return true;
  if (resolved.kind === 'bare' && resolved.spec === 'idb-keyval') return true;
  if (resolved.kind === 'file' && relPosix(resolved.path) === 'vendor/idb-keyval.js') {
    return true;
  }
  return false;
}

/** Read a root handoff file's text, or null when absent. */
export function readRootFile(name) {
  const p = join(ROOT, name);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

/** Print the result of an assertion and exit non-zero on any violation. */
export function finish(name, violations) {
  if (violations.length) {
    console.error(`✗ ${name} FAILED (${violations.length} violation(s)):`);
    for (const v of violations) console.error('    - ' + v);
    process.exit(1);
  }
  console.log(`✓ ${name} passed`);
}
