#!/usr/bin/env node
// assert-a11y-semantics
//
// Guards the accessibility remediation contract for the presentation layer:
// section navigation is navigation (not tabs/listbox), selectable chips expose
// checked state, modals manage focus, and common controls keep a 44px target.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, finish } from './_lib.mjs';

const violations = [];

function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

function mustInclude(rel, needle, message) {
  if (!read(rel).includes(needle)) violations.push(`${rel}: ${message}`);
}

function mustNotInclude(rel, needle, message) {
  if (read(rel).includes(needle)) violations.push(`${rel}: ${message}`);
}

function cssBlock(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  return match ? match[1] : '';
}

function requireMinHeight(cssRel, selector, px) {
  const css = read(cssRel);
  const block = cssBlock(css, selector);
  if (!block) {
    violations.push(`${cssRel}: missing ${selector} rule`);
    return;
  }
  const match = block.match(/min-height\s*:\s*(\d+)px/);
  if (!match || Number(match[1]) < px) {
    violations.push(`${cssRel}: ${selector} must set min-height >= ${px}px`);
  }
}

function hexToken(css, name) {
  const match = css.match(new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{6})`));
  return match ? match[1] : null;
}

function luminance(hex) {
  const h = hex.slice(1);
  const rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const linear = rgb.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
}

function contrast(a, b) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// Section navigation should not claim tabs/listbox unless it implements the
// full ARIA patterns. The current component is a section navigator.
for (const forbidden of ['role="tablist"', "role='tablist'", "role=\"listbox\"", "role='listbox'", "role=\"option\"", "role='option'", "role=${role}"]) {
  mustNotInclude('src/ui/components/sq-section-nav.js', forbidden, 'section navigation must not use tab/listbox option semantics');
}
mustInclude('src/ui/components/sq-section-nav.js', '<nav class="section-nav"', 'section navigation must expose a labelled nav region');
mustInclude('src/ui/components/sq-section-nav.js', 'aria-current=${selected ? \'step\' : nothing}', 'active section must use aria-current="step"');

// Selectable option chips should present checkbox/radio style checked state,
// not push-button pressed state.
mustNotInclude('src/ui/components/sq-option.js', 'aria-pressed', 'selectable chips must not use aria-pressed');
mustInclude('src/ui/components/sq-option.js', 'aria-checked', 'selectable chips must expose aria-checked');
mustInclude('src/ui/components/sq-option.js', 'controlRole', 'sq-option must accept the rendered ARIA role from its field');
mustInclude('src/ui/components/sq-field.js', 'role=${controlRole === \'radio\' ? \'radiogroup\' : \'group\'}', 'option sets must expose a labelled group');
mustInclude('src/ui/components/sq-field.js', 'control-role=${controlRole}', 'sq-field must pass option roles to sq-option');

// Dialogs must move focus inside, trap tab focus, make the background inert,
// and restore focus when dismissed.
for (const needle of ['_previousFocus', '_focusFirst', '_trapFocus', '_releaseFocus', '_setBackgroundInert', 'inert = inert']) {
  mustInclude('src/ui/components/sq-modal.js', needle, 'modal must manage focus and background inertness');
}
mustInclude('src/ui/components/sq-modal.js', 'this._releaseFocus();\n    this.dispatchEvent', 'modal must release inert background before emitting close events');

// A skip link and a stable main target let keyboard users bypass repeated
// navigation once the workspace shell is visible.
mustInclude('src/ui/app.js', 'class="skip-link"', 'app shell must render a skip link');
mustInclude('src/ui/app.js', 'id="main-content"', 'workspace main must provide a stable skip target');
mustInclude('src/ui/app.js', '<main id="main-content"', 'workspace must expose the page main region');

// Common interactive targets should be at least 44px tall.
requireMinHeight('src/ui/styles/base.css', '.btn', 44);
requireMinHeight('src/ui/styles/components.css', 'sq-option', 44);
requireMinHeight('src/ui/styles/components.css', '.sq-text-input', 44);
requireMinHeight('src/ui/styles/components.css', '.sq-color-btn', 44);
requireMinHeight('src/ui/styles/screens.css', '.seclist .navitem', 44);
requireMinHeight('src/ui/styles/screens.css', '.rail-reset', 44);

// Filled primary buttons must meet enhanced contrast against their text.
const tokens = read('src/ui/styles/tokens.css');
const onSignal = hexToken(tokens, '--on-signal');
const signalDeep = hexToken(tokens, '--signal-deep');
if (!onSignal || !signalDeep || contrast(onSignal, signalDeep) < 7) {
  violations.push('src/ui/styles/tokens.css: --on-signal on --signal-deep must meet 7:1 contrast');
}
mustInclude('src/ui/styles/base.css', '.btn.primary { background: var(--signal-deep);', 'primary button fill must use the darker accessible signal color');

finish('assert-a11y-semantics', violations);
