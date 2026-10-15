// Browser storage can be missing, full or blocked (private windows): fall back to memory so the
// flow keeps working for the current tab instead of throwing.
const memory = new Map<string, string>();

function backing(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** The in-memory copy only exists for keys the browser refused to store, never to shadow storage. */
export function readJson<T>(key: string, fallback: T): T {
  let raw: string | null | undefined = memory.get(key);
  if (raw == null) {
    try {
      raw = backing()?.getItem(key);
    } catch {
      raw = undefined;
    }
  }
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  const raw = JSON.stringify(value);
  try {
    const store = backing();
    if (!store) throw new Error("no storage");
    store.setItem(key, raw);
    memory.delete(key);
  } catch {
    // Quota, private window or no storage: keep it in memory so this tab still works.
    memory.set(key, raw);
  }
}

export function removeKey(key: string): void {
  memory.delete(key);
  try {
    backing()?.removeItem(key);
  } catch {
    // Nothing to clean up when storage is unavailable.
  }
}
