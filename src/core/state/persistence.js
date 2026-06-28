// The idb-keyval persistence adapter — the ONLY module that imports the access
// library and touches the store. It sits BEHIND the persistence adapter seam:
// swapping idb-keyval for idb / Dexie, or local for a post-MVP remote backend,
// must touch no capability. (service-map.yaml :: persistence.commitments;
// foundation.yaml :: tables)
//
// One idb-keyval object store ("staqpaq") holds three namespaced keyed records.
// Values are structured-clonable plain objects/arrays. QuotaExceededError (and
// any IO failure) is swallowed so in-memory state stays valid and export remains
// available — persistence is best-effort.

import { get, set, createStore } from 'idb-keyval';

const STORE = createStore('staqpaq-db', 'staqpaq');

export const KEYS = {
  DRAFT: 'staqpaq:draft',
  EVENTS: 'staqpaq:events',
  META: 'staqpaq:meta',
};

function isQuota(e) {
  if (!e) return false;
  if (e.name === 'QuotaExceededError') return true;
  if (typeof DOMException !== 'undefined' && e instanceof DOMException && e.code === 22) return true;
  return false;
}

async function safeSet(key, value) {
  try {
    await set(key, value, STORE);
    return { ok: true };
  } catch (e) {
    // Best-effort: a quota or IO failure never breaks the app.
    return { ok: false, quota: isQuota(e) };
  }
}

async function safeGet(key) {
  try {
    return await get(key, STORE);
  } catch {
    return undefined;
  }
}

export const readDraft = () => safeGet(KEYS.DRAFT);
export const writeDraft = (spec) => safeSet(KEYS.DRAFT, spec);

export const readEvents = () => safeGet(KEYS.EVENTS);
export const writeEvents = (log) => safeSet(KEYS.EVENTS, { log });

export const readMeta = () => safeGet(KEYS.META);
export const writeMeta = (meta) => safeSet(KEYS.META, meta);

/** Request persistent (non-best-effort) storage to reduce LRU eviction risk. */
export async function requestPersistentStorage() {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      return await navigator.storage.persist();
    }
  } catch {
    /* unsupported / denied — ignore */
  }
  return false;
}
