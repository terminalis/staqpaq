// The in-memory canonical store + write-through persistence. This is the single
// source of truth at runtime and the ONLY writer of the three keyed records.
// The orchestrator (and only the orchestrator) drives it: read the draft, commit
// a new selections map (persist step), append events (emit step).
// (foundation.yaml :: structural_enforcement — assert-single-orchestrator /
//  assert-no-direct-db-access police that nothing else reaches persistence.)

import { createBuildSpec, withSelections } from './buildSpec.js';
import {
  readDraft, writeDraft, readEvents, writeEvents, readMeta, writeMeta, requestPersistentStorage,
} from './persistence.js';
import { normalizeSelections } from '../selections/normalizeSelections.js';
import { readModel } from './readModel.js';

let _current = null; // the canonical BuildSpec (in memory)
let _events = []; // the event log (in memory)
let _booted = false;
// What boot found: a resumed draft and any selections dropped/rewritten while
// normalizing against the current catalogue. Read-only boot telemetry for the UI.
let _bootInfo = { resumed: false, updated_at: null, decided_count: 0, migrated_paths: [] };
// The last write-through outcome. Persistence stays best-effort (failures never
// break the app) but the degradation is REPORTABLE instead of silent.
let _persistHealth = { ok: true, quota: false, at: null };

function sameSelections(a = {}, b = {}) {
  const ak = Object.keys(a).sort();
  const bk = Object.keys(b).sort();
  if (ak.length !== bk.length) return false;
  for (let i = 0; i < ak.length; i++) {
    if (ak[i] !== bk[i]) return false;
    if (JSON.stringify(a[ak[i]]) !== JSON.stringify(b[bk[i]])) return false;
  }
  return true;
}

/** Boot: ensure meta, request persistent storage, hydrate the draft + event log.
 *  Initialization order mirrors foundation.yaml :: migration_order. */
export async function bootState(catalogue) {
  if (_booted) return;

  const meta = (await readMeta()) || { layout: 'v1', persist_requested: false };
  if (!meta.layout) meta.layout = 'v1';
  const granted = await requestPersistentStorage();
  if (granted) meta.persist_requested = true;
  await writeMeta(meta);

  const draft = await readDraft();
  if (draft) {
    const rawSelections = draft.selections && typeof draft.selections === 'object' ? draft.selections : {};
    const selections = catalogue ? normalizeSelections(rawSelections, catalogue) : { ...rawSelections };
    const changed = !sameSelections(rawSelections, selections);
    _current = changed ? withSelections(draft, selections) : { ...draft, selections: { ...selections } };
    if (changed) await writeDraft(_current);
    const migrated_paths = Object.keys(rawSelections)
      .filter((k) => JSON.stringify(rawSelections[k]) !== JSON.stringify(selections[k]));
    const decided = new Set(Object.keys(selections).map((k) =>
      k.endsWith('.custom') ? k.slice(0, -7) : k.endsWith('.dismissed') ? k.slice(0, -10) : k,
    ));
    _bootInfo = {
      resumed: decided.size > 0,
      updated_at: draft.updated_at || null,
      decided_count: decided.size,
      migrated_paths,
    };
  } else {
    _current = createBuildSpec(); // empty in-memory draft if none persisted yet
  }

  const ev = await readEvents();
  _events = ev && Array.isArray(ev.log) ? ev.log.slice() : [];

  _booted = true;
}

/** The current canonical BuildSpec (read). */
export function getDraft() {
  if (!_current) _current = createBuildSpec();
  return readModel(_current);
}

/** The in-memory event log (read, copy). */
export function getEvents() {
  return readModel(_events);
}

/** What boot found (read, copy) — resumed draft + catalogue-migration report. */
export function getBootInfo() {
  return readModel(_bootInfo);
}

/** The last write-through outcome (read, copy) — best-effort persistence health. */
export function getPersistHealth() {
  return readModel(_persistHealth);
}

function noteWrite(res) {
  _persistHealth = { ok: !!(res && res.ok), quota: !!(res && res.quota), at: new Date().toISOString() };
}

/** Persist step — write-through a new selections map as the whole aggregate.
 *  Stamps updated_at, replaces the in-memory current, persists the draft key.
 *  Quota/IO failure is swallowed by the adapter; in-memory state stays valid —
 *  but the outcome is recorded so the UI can surface the degradation. */
export async function commitSelections(selections) {
  const next = withSelections(getDraft(), selections);
  _current = next;
  noteWrite(await writeDraft(next));
  return next;
}

/** Emit step — append events to the log and write-through the events key. */
export async function appendEvents(events) {
  if (!events || events.length === 0) return;
  const at = new Date().toISOString();
  for (const e of events) {
    _events.push({ name: e.name, payload: e.payload || {}, at });
  }
  noteWrite(await writeEvents(_events));
}
