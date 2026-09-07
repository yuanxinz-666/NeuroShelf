const flushers = new Map();
export function registerDraftFlusher(id, fn) { flushers.set(id, fn); return () => flushers.delete(id); }
export async function flushDrafts(exceptId) { await Promise.all([...flushers.entries()].filter(([id]) => id !== exceptId).map(([, fn]) => fn())); }
