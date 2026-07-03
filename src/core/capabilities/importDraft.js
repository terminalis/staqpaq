// import_draft — replace the working draft with the selections encoded in a
// previously exported staqpaq.yaml. The inverse of export: parse the emitted
// subset, flatten against the CURRENT catalogue, then normalize-then-adopt —
// unknown paths/keys drop with an explicit report, gated combinations sweep,
// and canonical order is re-imposed, so import(export(S)) === S for
// app-produced files while hand-edited files converge to the nearest valid
// state. Confirmation is `on_overwrite` (overwriting a non-empty draft). Emits
// draft_imported. Input: { text, file_name } — a user-chosen file's contents,
// NEVER the rendered preview (the preview surface stays inert).

import { parseStaqpaqYaml } from '../import/parseStaqpaqYaml.js';
import { flattenSpecTree } from '../import/flattenSpecTree.js';
import { normalizeSelections } from '../selections/normalizeSelections.js';

export function importDraft(ctx, input) {
  try {
    const text = input && typeof input.text === 'string' ? input.text : '';
    const file_name = input && typeof input.file_name === 'string' ? input.file_name : '';
    if (text.trim() === '') {
      return { error: { code: 'INVALID_YAML', line: 0, message: 'the file is empty' } };
    }

    const parsed = parseStaqpaqYaml(text);
    if (parsed.error) return { error: parsed.error };

    const flat = flattenSpecTree(parsed.tree, ctx.catalogue);
    const selections = normalizeSelections(flat.selections, ctx.catalogue);

    // report anything normalize dropped on top of what flatten already refused
    const normalizedAway = Object.keys(flat.selections).filter(
      (k) => JSON.stringify(flat.selections[k]) !== JSON.stringify(selections[k]),
    );
    const dropped_paths = [...new Set([...flat.dropped_paths, ...normalizedAway])];

    const decided = new Set(
      Object.keys(selections).map((k) =>
        k.endsWith('.custom') ? k.slice(0, -7) : k.endsWith('.dismissed') ? k.slice(0, -10) : k,
      ),
    );

    return {
      selections, // replace the ENTIRE working state with the imported draft
      events: [{
        name: 'draft_imported',
        payload: { selection_count: decided.size, dropped_paths, file_name },
      }],
      output: { imported: true, selection_count: decided.size, dropped_paths },
    };
  } catch (e) {
    // never throw across the orchestrator — a bad file is a reportable outcome
    return { error: { code: 'IMPORT_FAILED', message: String((e && e.message) || e) } };
  }
}
