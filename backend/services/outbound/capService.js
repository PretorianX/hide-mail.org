/**
 * Per-domain daily send cap counters.
 *
 * Redis keys:
 *   outbound:cap:<domain>:<YYYYMMDD>   plain integer string via INCR (UTC date)
 *   outbound:domain:meta:<domain>      read/write dailyLimit (owned by domainService shape)
 */

const redisService = require('../redisService');

const META_PREFIX = 'outbound:domain:meta:';

const utcDateStamp = (date = new Date()) => {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
};

const secondsUntilNextUtcMidnight = (now = new Date()) => {
  const next = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
    0
  );
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
};

const nextUtcMidnightMs = (now = new Date()) =>
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0);

const capKey = (domain, now = new Date()) => `outbound:cap:${domain}:${utcDateStamp(now)}`;

const readMeta = async (domain) => {
  const raw = await redisService.client.get(`${META_PREFIX}${domain}`);
  return raw ? JSON.parse(raw) : null;
};

const getDailyLimit = async (domain) => {
  const meta = await readMeta(domain);
  if (!meta) {
    return null;
  }
  return meta.dailyLimit === undefined ? null : meta.dailyLimit;
};

const setDailyLimit = async (domain, limit) => {
  const meta = await readMeta(domain);
  if (!meta) {
    throw new Error(`Cannot set dailyLimit for unknown domain: ${domain}`);
  }
  meta.dailyLimit = limit;
  await redisService.client.set(`${META_PREFIX}${domain}`, JSON.stringify(meta));
};

const checkAndIncrement = async (domain) => {
  const now = new Date();
  const key = capKey(domain, now);
  const limit = await getDailyLimit(domain);
  const resetAt = nextUtcMidnightMs(now);

  const current = await redisService.client.incr(key);
  if (current === 1) {
    await redisService.client.expire(key, secondsUntilNextUtcMidnight(now));
  }

  if (limit === null || limit === undefined) {
    return { allowed: true, remaining: null, resetAt };
  }

  if (current > limit) {
    await redisService.client.decr(key);
    return { allowed: false, remaining: 0, resetAt };
  }

  return { allowed: true, remaining: Math.max(0, limit - current), resetAt };
};

/** Undo a successful checkAndIncrement (e.g. ZoneMTA refused the submission). */
const releaseIncrement = async (domain) => {
  await redisService.client.decr(capKey(domain));
};

const peekCounter = async (domain) => {
  const raw = await redisService.client.get(capKey(domain));
  return raw === null ? 0 : Number(raw);
};

module.exports = {
  getDailyLimit,
  setDailyLimit,
  checkAndIncrement,
  releaseIncrement,
  peekCounter,
};
