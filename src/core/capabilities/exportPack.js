// export_pack — THE commit. Re-derive everything from canonical state and
// materialize the deterministic bundle. scope=yaml emits the single canonical
// file; scope=pack emits the full companion bundle + zip. Export is NEVER blocked
// by readiness or missing decisions. Emits pack_exported. No canonical-state
// mutation. (capabilities.yaml :: export_pack)

import { buildPack } from '../export/buildPack.js';

const PACK_FILES = ['staqpaq.yaml', 'staqpaq.md', 'asset-checklist.md', 'missing-decisions.md', '.env.example'];

export function exportPack(ctx, input) {
  const scope = input && input.scope === 'pack' ? 'pack' : 'yaml';
  const pack = buildPack(ctx.draft.selections, ctx.catalogue, scope);

  // distinct decided field paths (custom / dismissed sidecars count as their base field)
  const decided = new Set(
    Object.keys(ctx.draft.selections).map((k) =>
      k.endsWith('.custom') ? k.slice(0, -7) : k.endsWith('.dismissed') ? k.slice(0, -10) : k,
    ),
  );
  const artifact_names = scope === 'pack' ? PACK_FILES : ['staqpaq.yaml'];

  return {
    output: pack,
    events: [{ name: 'pack_exported', payload: { scope, artifact_names, selection_count: decided.size } }],
  };
}
