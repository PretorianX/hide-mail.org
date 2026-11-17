/**
 * Per-account send rate limiter (fixed one-minute UTC window).
 *
 * Redis keys:
 *   outbound:ratelimit:<accountId>:<YYYYMMDDHHmm>   INCR, TTL 70s on first increment
 *   outbound:ratelimit:override:<accountId>         plain integer, no TTL
 */

const redisService = require('../redisService');
const config = require('../../config/config');

const OVERRIDE_PREFIX = 'outbound:ratelimit:override:';

const utcMinuteStamp = (date = new Date()) => {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mi = String(date.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}${mm}${dd}${hh}${mi}`;
};

const secondsUntilNextMinute = (now = new Date()) => {
  const msIntoMinute = (now.getUTCSeconds() * 1000) + now.getUTCMilliseconds();
  return Math.max(1, Math.ceil((60_000 - msIntoMinute) / 1000));
};

const windowKey = (accountId, now = new Date()) =>
  `outbound:ratelimit:${accountId}:${utcMinuteStamp(now)}`;

const getLimit = async (accountId) => {
  const raw = await redisService.client.get(`${OVERRIDE_PREFIX}${accountId}`);
  if (raw !== null && raw !== undefined) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return config.outbound.ratePerMinuteDefault;
};

const setOverride = async (accountId, perMinute) => {
  await redisService.client.set(`${OVERRIDE_PREFIX}${accountId}`, String(perMinute));
};

const checkAndIncrement = async (accountId) => {
  const now = new Date();
  const limit = await getLimit(accountId);
  const key = windowKey(accountId, now);
  const current = await redisService.client.incr(key);
  if (current === 1) {
    await redisService.client.expire(key, 70);
  }

  const retryAfterSeconds = secondsUntilNextMinute(now);
  if (current > limit) {
    return { allowed: false, limit, retryAfterSeconds };
  }
  return { allowed: true, limit, retryAfterSeconds };
};

module.exports = {
  checkAndIncrement,
  setOverride,
  getLimit,
};
