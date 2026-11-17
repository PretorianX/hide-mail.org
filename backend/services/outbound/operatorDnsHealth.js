/**
 * Health of the operator's own return-path and HELO DNS records.
 * Cached in Redis so :9001 scrapes do not hammer public DNS.
 */

const dns = require('dns').promises;
const redisService = require('../redisService');

const CACHE_KEY = 'outbound:metrics:operator-dns';

const defaultResolver = {
  resolveMx: (name) => dns.resolveMx(name),
  resolveTxt: (name) => dns.resolveTxt(name),
  resolve4: (name) => dns.resolve4(name),
  resolve6: (name) => dns.resolve6(name),
};

const readCache = async () => {
  const raw = await redisService.client.get(CACHE_KEY);
  return raw ? JSON.parse(raw) : null;
};

const writeCache = async (payload, ttlSeconds) => {
  await redisService.client.set(CACHE_KEY, JSON.stringify(payload));
  await redisService.client.expire(CACHE_KEY, Math.max(1, ttlSeconds));
};

const checkReturnPathMx = async (target, resolver) => {
  try {
    const records = await resolver.resolveMx(target);
    return Array.isArray(records) && records.length > 0 ? 1 : 0;
  } catch {
    return 0;
  }
};

const checkReturnPathSpf = async (target, resolver) => {
  try {
    const records = await resolver.resolveTxt(target);
    const flat = records.map((parts) => (Array.isArray(parts) ? parts.join('') : String(parts)));
    return flat.some((txt) => /\bv=spf1\b/i.test(txt)) ? 1 : 0;
  } catch {
    return 0;
  }
};

const checkHeloA = async (hostname, resolver) => {
  if (!hostname) {
    return 0;
  }
  try {
    const v4 = await resolver.resolve4(hostname);
    if (Array.isArray(v4) && v4.length > 0) {
      return 1;
    }
  } catch {
    // try AAAA
  }
  try {
    const v6 = await resolver.resolve6(hostname);
    return Array.isArray(v6) && v6.length > 0 ? 1 : 0;
  } catch {
    return 0;
  }
};

/**
 * @returns {Promise<{return_path_mx:number,return_path_spf:number,helo_a:number,checkedAt:number}>}
 */
const getOperatorDnsHealth = async ({
  resolver = defaultResolver,
  returnPathTarget = process.env.OUTBOUND_RETURN_PATH_TARGET,
  heloHostname = process.env.OUTBOUND_HELO_HOSTNAME,
  cacheTtlSeconds = Number(process.env.OUTBOUND_DNS_RECHECK_SECONDS || 3600),
  forceRefresh = false,
} = {}) => {
  if (!forceRefresh) {
    const cached = await readCache();
    if (cached) {
      return cached;
    }
  }

  const payload = {
    return_path_mx: returnPathTarget ? await checkReturnPathMx(returnPathTarget, resolver) : 0,
    return_path_spf: returnPathTarget ? await checkReturnPathSpf(returnPathTarget, resolver) : 0,
    helo_a: await checkHeloA(heloHostname, resolver),
    checkedAt: Date.now(),
  };

  await writeCache(payload, cacheTtlSeconds);
  return payload;
};

module.exports = {
  getOperatorDnsHealth,
  CACHE_KEY,
};
