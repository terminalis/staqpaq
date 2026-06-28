#!/usr/bin/env node
// assert-local-presentation-assets
//
// staqpaq's presentation layer must not depend on remote font/icon CDNs.
// The icon registry is selected-only: every used Iconify-style ID must exist
// locally, and every local registry entry must be used by source or catalogue.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, walk, relPosix, finish } from './_lib.mjs';

const violations = [];
const forbidden = ['fonts.googleapis.com', 'fonts.gstatic.com', 'code.iconify.design', 'iconify-icon'];
const iconIdPattern = /['"`]((?:simple-icons|solar|mdi|logos|hugeicons):[A-Za-z0-9.-]+)['"`]/g;
const renderer = read('src/ui/icons/sq-icon.js');
const optionRenderer = read('src/ui/components/sq-option.js');
const fieldRenderer = read('src/ui/components/sq-field.js');
const componentStyles = read('src/ui/styles/components.css');
const requiredFonts = [
  'src/ui/fonts/share-tech-mono-latin.woff2',
  'src/ui/fonts/vt323-latin.woff2',
  'src/ui/fonts/vt323-latin-ext.woff2',
  'src/ui/fonts/vt323-vietnamese.woff2',
];

function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

for (const rel of ['index.html', ...walk(join(ROOT, 'src')).map(relPosix)]) {
  const text = read(rel);
  for (const needle of forbidden) {
    if (text.includes(needle)) violations.push(`${rel} still references '${needle}'`);
  }
}

for (const rel of requiredFonts) {
  if (!existsSync(join(ROOT, rel))) violations.push(`${rel} is missing`);
}

if (!renderer.includes('toMonochrome(icon.body)')) {
  violations.push('src/ui/icons/sq-icon.js must normalize vendored SVG icon bodies to monochrome currentColor');
}
if (!renderer.includes('fill="currentColor"')) {
  violations.push('src/ui/icons/sq-icon.js must set the root SVG fill to currentColor for paths without explicit fill');
}

const optionIconIndex = optionRenderer.indexOf('<sq-icon class="lg"');
const optionPlaceholderIndex = optionRenderer.indexOf('class="opt-icon-placeholder lg"');
const optionLabelIndex = optionRenderer.indexOf('class="opt-label"');
if (optionIconIndex === -1 || optionPlaceholderIndex === -1 || optionLabelIndex === -1) {
  violations.push('src/ui/components/sq-option.js must render option icon, placeholder, and label slots');
} else if (optionLabelIndex < optionIconIndex || optionLabelIndex < optionPlaceholderIndex) {
  violations.push('src/ui/components/sq-option.js must render the icon/placeholder slot before .opt-label');
}

if (!componentStyles.includes('.opt-icon-placeholder') || !componentStyles.includes('border: 1px solid currentColor')) {
  violations.push('src/ui/styles/components.css must style the option icon placeholder as an outlined square');
}

for (const fieldPath of ['frontend.framework', 'database.provider', 'auth.provider', 'payments.provider', 'monitoring.analytics']) {
  if (!fieldRenderer.includes(`'${fieldPath}'`)) {
    violations.push(`src/ui/components/sq-field.js placeholder allowlist is missing ${fieldPath}`);
  }
}
for (const fieldPath of ['project.platforms', 'notifications.channels']) {
  if (fieldRenderer.includes(`'${fieldPath}'`)) {
    violations.push(`src/ui/components/sq-field.js placeholder allowlist must not include ${fieldPath}`);
  }
}
for (const exclusion of ['none', 'other', 'custom', 'self_hosted', 'headless', 'internal']) {
  if (!fieldRenderer.toLowerCase().includes(exclusion)) {
    violations.push(`src/ui/components/sq-field.js placeholder exclusions must cover ${exclusion}`);
  }
}
const brandPrefixDeclaration = fieldRenderer.match(/BRAND_ICON_PREFIXES\s*=\s*\[([^\]]+)\]/s);
if (!brandPrefixDeclaration || !brandPrefixDeclaration[1].includes('simple-icons:')
  || !brandPrefixDeclaration[1].includes('logos:')
  || !brandPrefixDeclaration[1].includes('hugeicons:')
  || brandPrefixDeclaration[1].includes('mdi:')) {
  violations.push('src/ui/components/sq-field.js brand icon prefixes must be simple-icons/logos/hugeicons only');
}

const used = new Set();
const catalogue = JSON.parse(read('data/catalogue.json'));

function findField(path) {
  for (const section of catalogue.sections || []) {
    for (const field of section.fields || []) {
      if (field.path === path) return field;
    }
  }
  return null;
}

const notificationChannels = findField('notifications.channels');
if (notificationChannels && (notificationChannels.options || []).some((option) => option.icon)) {
  violations.push('notifications.channels must not use brand icons; keep it as generic channel labels');
}

const targetPlatforms = findField('project.platforms');
const cliOption = targetPlatforms && (targetPlatforms.options || []).find((option) => option.key === 'cli');
if (!cliOption || cliOption.icon !== 'mdi:console') {
  violations.push('project.platforms:cli must use the generic mdi:console icon');
}

function collectCatalogueIcons(value) {
  if (Array.isArray(value)) {
    for (const item of value) collectCatalogueIcons(item);
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (typeof value.icon === 'string' && value.icon.includes(':')) used.add(value.icon);
  for (const child of Object.values(value)) collectCatalogueIcons(child);
}
collectCatalogueIcons(catalogue);

for (const file of walk(join(ROOT, 'src'))) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(iconIdPattern)) {
    used.add(match[1]);
  }
}

const { ICONS } = await import(pathToFileURL(join(ROOT, 'src/ui/icons/icon-data.js')).href);
const local = new Set(Object.keys(ICONS));

for (const id of [...used].sort()) {
  if (!local.has(id)) violations.push(`missing local icon data for ${id}`);
}

for (const id of [...local].sort()) {
  if (!used.has(id)) violations.push(`unused local icon data for ${id}`);
}

finish('assert-local-presentation-assets', violations);
