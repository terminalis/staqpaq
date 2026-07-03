// The companion-artifact generators. All pure + deterministic, derived from the
// canonical tree and derived read-model.
//
//   staqpaq.md          - human-readable, generated one-way from the yaml tree
//   AGENTS.md           - the consumer brief: how a human or agent uses the pack
//   asset-checklist.md  - actual brand-asset files only
//   .env.example        - env vars from selected providers only
//
// missing-decisions.md was retired from the pack: "missing" asserted gaps the
// user may have left open deliberately (severity is the catalogue's opinion,
// not the project's). Open recommendations remain an in-app review aid only;
// AGENTS.md tells consumers that undecided fields are deliberately open.

const TITLES = {
  project: 'Project', business: 'Business Model', frontend: 'Frontend',
  backend: 'Backend', database: 'Database', auth: 'Authentication',
  payments: 'Payments', ai: 'AI Integration', notifications: 'Notifications',
  deployment: 'Deployment', monitoring: 'Monitoring', content: 'Content',
  support: 'Support', design: 'Visual Foundations', surface: 'Surfaces', assets: 'Assets',
};

const CONTROL_OR_LINE = /[\u0000-\u001f\u007f]+/g;
const ENV_KEY = /^[A-Z_][A-Z0-9_]*$/;

function titleCase(key) {
  if (TITLES[key]) return TITLES[key];
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function inlineText(value) {
  return String(value ?? '').replace(CONTROL_OR_LINE, ' ').replace(/\s+/g, ' ').trim();
}

function codeText(value) {
  return inlineText(value).replace(/`/g, '\\`');
}

export function projectName(selections) {
  return selections['project.name'] || selections['project.name.custom'] || 'staqpaq project';
}

function fmtVal(v) {
  if (Array.isArray(v)) return v.map(inlineText).join(', ');
  if (v && typeof v === 'object') {
    return Object.keys(v).map((key) => `${inlineText(key)}: ${fmtVal(v[key])}`).join(', ');
  }
  return inlineText(v);
}

/** staqpaq.md - generated one-way from the canonical tree. */
export function staqpaqMd(tree, name) {
  const out = [
    `# ${inlineText(name)} \u2014 staqpaq build manifest`,
    '',
    'Generated one-way from `staqpaq.yaml` \u2014 do not hand-edit; regenerate from staqpaq.',
    '',
  ];
  const keys = Object.keys(tree);
  if (keys.length === 0) {
    out.push('_No decisions recorded yet._', '');
  }
  for (const key of keys) {
    out.push(`## ${titleCase(key)}`, '');
    const node = tree[key];
    if (node && typeof node === 'object' && !Array.isArray(node)) {
      for (const k of Object.keys(node)) out.push(`- **${inlineText(k)}:** ${fmtVal(node[k])}`);
    } else {
      out.push(`- ${fmtVal(node)}`);
    }
    out.push('');
  }
  return out.join('\n');
}

/** asset-checklist.md - actual brand-asset files only. */
export function assetChecklistMd(requiredAssets, name) {
  const out = [
    `# Brand asset checklist \u2014 ${inlineText(name)}`,
    '',
    'Brand-asset files implied by your selections \u2014 checked = you have it, unchecked = still needed.',
    '',
  ];
  if (!requiredAssets.length) {
    out.push('- _No brand assets implied by the current selections yet._');
  } else {
    for (const a of requiredAssets) {
      out.push(`- [${a.have ? 'x' : ' '}] ${inlineText(a.label)} \u2014 \`${codeText(a.filename_hint)}\``);
    }
  }
  return out.join('\n') + '\n';
}

/** AGENTS.md - the pack's consumer story: read order + ground rules for a human
 *  or coding agent building from these decisions. Named for the agent-
 *  instructions convention so an agent starting in an unzipped pack reads it
 *  unprompted. Deterministic over (tree, derived, name). */
export function agentBriefMd(tree, derived, name) {
  const decided = Object.keys(tree || {}).length;
  const envCount = (derived.implied_env_vars || []).length;
  const assetCount = (derived.required_assets || []).length;
  return [
    `# Agent brief — ${inlineText(name)}`,
    '',
    'This pack was exported from staqpaq (a client-only build-manifest generator).',
    'It is the bill of materials for a build — written for a human or a coding',
    'agent starting from these decisions.',
    '',
    '## Read order',
    '',
    '1. `staqpaq.yaml` — the canonical manifest: every decision the author made.',
    '2. `asset-checklist.md` — brand-asset files the build expects (`[x]` = provided).',
    '3. `.env.example` — environment variable keys implied by the chosen providers.',
    '4. `staqpaq.md` — the same manifest, human-readable.',
    '',
    '## Ground rules',
    '',
    '- `staqpaq.yaml` is the single source of intent. Build what it says; do not',
    '  infer decisions it does not contain.',
    '- **Anything absent is deliberately open — not missing, not a defect.** Pick a',
    '  sensible default and record it in your build notes, or ask the author.',
    '- Free-text values are the author’s own vocabulary; treat them as requirements',
    '  even when you do not recognize the name.',
    '- Environment variable values are never included. Wire the keys from',
    '  `.env.example` and leave the values to the operator.',
    '',
    '## This pack',
    '',
    `- Decided sections: ${decided}`,
    `- Implied env var keys: ${envCount}`,
    `- Brand assets expected: ${assetCount}`,
    '',
  ].join('\n');
}

/** .env.example - env vars from selected providers only. */
export function envExample(impliedEnvVars, name) {
  const out = [
    `# .env.example \u2014 generated by staqpaq for ${inlineText(name)}`,
    '# Environment variables implied by the selected providers. Fill in real values.',
    "# (A PACK OUTPUT describing your configured product \u2014 not staqpaq's own runtime.)",
    '',
  ];
  if (!impliedEnvVars.length) {
    out.push('# No provider environment variables implied by the current selections.');
    return out.join('\n') + '\n';
  }
  let lastProvider = null;
  for (const e of impliedEnvVars) {
    const key = inlineText(e.key);
    if (!ENV_KEY.test(key)) continue;
    const provider = inlineText(e.from_provider);
    if (provider !== lastProvider) {
      out.push(`# ${provider}`);
      lastProvider = provider;
    }
    out.push(`${key}=`);
  }
  return out.join('\n') + '\n';
}
