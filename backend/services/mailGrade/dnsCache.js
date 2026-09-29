/**
 * Short in-memory TTL cache for DNS / RBL lookups.
 */

const createDnsCache = ({ ttlMs = 10 * 60 * 1000, now = () => Date.now() } = {}) => {
  const store = new Map();

  const get = async (key, loader) => {
    const hit = store.get(key);
    const ts = now();
    if (hit && hit.expiresAt > ts) {
      return hit.value;
    }
    const value = await loader();
    store.set(key, { value, expiresAt: ts + ttlMs });
    return value;
  };

  const clear = () => store.clear();

  return { get, clear };
};

module.exports = {
  createDnsCache,
};
