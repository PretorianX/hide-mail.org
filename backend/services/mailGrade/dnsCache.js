/**
 * Short in-memory TTL cache for DNS / RBL lookups.
 */

const createDnsCache = ({ ttlMs = 10 * 60 * 1000, maxEntries = 1000, now = () => Date.now() } = {}) => {
  const store = new Map();

  const evictIfNeeded = (ts) => {
    if (store.size < maxEntries) return;
    for (const [k, entry] of store.entries()) {
      if (entry.expiresAt <= ts) {
        store.delete(k);
      }
    }
    while (store.size >= maxEntries) {
      const oldestKey = store.keys().next().value;
      if (oldestKey === undefined) break;
      store.delete(oldestKey);
    }
  };

  const get = async (key, loader) => {
    const hit = store.get(key);
    const ts = now();
    if (hit && hit.expiresAt > ts) {
      return hit.value;
    }
    const value = await loader();
    evictIfNeeded(now());
    store.set(key, { value, expiresAt: now() + ttlMs });
    return value;
  };

  const clear = () => store.clear();

  return { get, clear };
};

module.exports = {
  createDnsCache,
};
