// Assemble the export pack from CANONICAL STATE. Every artifact is RE-DERIVED
// here (never lifted from the rendered preview): export_pack re-runs the SAME
// derive_requirements + serializer the live preview uses. This is the capability-
// side re-derivation that stands in for "server-side re-derivation" in a
// client-only build (snag S3), enforced by assert-inert-interactive-surface.
// Pure: no canonical-state mutation. (capabilities.yaml :: export_pack flow)

import { deriveRequirements } from '../derive/deriveRequirements.js';
import { normalizeSelections } from '../selections/normalizeSelections.js';
import { serializeYaml, buildSpecTree } from './serializeYaml.js';
import { staqpaqMd, agentBriefMd, assetChecklistMd, envExample, projectName } from './artifacts.js';
import { zipArtifacts } from './archive.js';

/** @param {'yaml'|'pack'} scope */
export function buildPack(selections, catalogue, scope = 'yaml') {
  const sel = normalizeSelections(selections || {}, catalogue);
  const derived = deriveRequirements(sel, catalogue); // re-derive from canonical state
  const name = projectName(sel);
  const staqpaq_yaml = serializeYaml(sel, catalogue);

  const result = { scope, staqpaq_yaml, project_name: sel['project.name'] || sel['project.name.custom'] || '' };
  if (scope !== 'pack') return result;

  const tree = buildSpecTree(sel, catalogue);
  result.staqpaq_md = staqpaqMd(tree, name);
  result.agent_brief_md = agentBriefMd(tree, derived, name);
  result.asset_checklist_md = assetChecklistMd(derived.required_assets, name);
  result.env_example = envExample(derived.implied_env_vars, name);

  const files = {
    'staqpaq.yaml': staqpaq_yaml,
    'staqpaq.md': result.staqpaq_md,
    'AGENTS.md': result.agent_brief_md,
    'asset-checklist.md': result.asset_checklist_md,
    '.env.example': result.env_example,
  };
  result.files = Object.keys(files);
  result.pack_zip = zipArtifacts(files); // Uint8Array — the UI wraps it in a Blob to download
  return result;
}
