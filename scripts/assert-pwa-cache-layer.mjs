#!/usr/bin/env node
// assert-pwa-cache-layer
//
// The PWA layer is delivery-only. It may cache version-controlled static files,
// but it must not own app state, export generation, or orchestrator behavior.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, finish } from './_lib.mjs';

const violations = [];
const manifestPath = join(ROOT, 'assets', 'manifest.webmanifest');
const workerPath = join(ROOT, 'sw.js');
const mainPath = join(ROOT, 'src', 'ui', 'main.js');

if (!existsSync(manifestPath)) {
  violations.push('assets/manifest.webmanifest is missing');
} else {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const field of ['id', 'start_url', 'scope']) {
    if (typeof manifest[field] !== 'string') {
      violations.push(`manifest.${field} must be a string`);
    } else if (manifest[field].startsWith('/')) {
      violations.push(`manifest.${field} must not be root-relative`);
    } else if (manifest[field] !== '../') {
      violations.push(`manifest.${field} must be '../' for root/subpath portability`);
    }
  }
  for (const icon of manifest.icons || []) {
    if (!icon.src || typeof icon.src !== 'string') {
      violations.push('manifest icon is missing src');
    } else if (icon.src.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(icon.src)) {
      violations.push(`manifest icon '${icon.src}' must be manifest-relative`);
    } else if (icon.src.includes('/')) {
      violations.push(`manifest icon '${icon.src}' should be a filename relative to assets/`);
    }
  }
}

if (!existsSync(workerPath)) {
  violations.push('sw.js must exist at the repository root');
} else {
  const worker = readFileSync(workerPath, 'utf8');
  if (!worker.includes("CACHE_VERSION = 'staqpaq-shell-")) {
    violations.push('sw.js must declare a versioned staqpaq-shell cache');
  }
  if (!worker.includes('self.clients.claim()')) {
    violations.push('sw.js must claim clients after activation');
  }
  if (!worker.includes("request.method !== 'GET'")) {
    violations.push('sw.js must ignore non-GET requests');
  }
  if (!worker.includes('isScopedSameOrigin(url)')) {
    violations.push('sw.js must gate fetch handling to same-origin scoped URLs');
  }

  const shellMatch = worker.match(/SHELL_PATHS\s*=\s*Object\.freeze\(\s*(\[[\s\S]*?\])\s*\)/);
  if (!shellMatch) {
    violations.push('sw.js must declare SHELL_PATHS as a frozen literal list');
  } else {
    const shellPaths = JSON.parse(shellMatch[1].replace(/'/g, '"'));
    for (const path of shellPaths) {
      if (typeof path !== 'string') {
        violations.push('SHELL_PATHS entries must be strings');
      } else if (!path.startsWith('./')) {
        violations.push(`SHELL_PATHS entry '${path}' must be relative to service-worker scope`);
      } else if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//')) {
        violations.push(`SHELL_PATHS entry '${path}' must not be absolute or cross-origin`);
      }
    }
  }

  const forbidden = [
    'indexedDB',
    'staqpaq-db',
    'staqpaq:draft',
    'src/core/capabilities/',
    'src/core/export/',
    'export_pack',
    'buildPack',
  ];
  for (const needle of forbidden) {
    if (worker.includes(needle)) {
      violations.push(`sw.js must not mention domain-state/export/capability detail '${needle}'`);
    }
  }
}

if (!existsSync(mainPath)) {
  violations.push('src/ui/main.js is missing');
} else {
  const main = readFileSync(mainPath, 'utf8');
  if (!main.includes('navigator.serviceWorker.register(new URL')) {
    violations.push('src/ui/main.js must register the service worker with a URL resolved from import.meta.url');
  }
  if (!main.includes("location.protocol === 'file:'")) {
    violations.push('src/ui/main.js must skip service-worker registration for file: loads');
  }
  if (!main.includes('STAQPAQ_CACHE_URLS')) {
    violations.push('src/ui/main.js must warm the delivery cache with loaded same-origin resources');
  }
}

finish('assert-pwa-cache-layer', violations);
