/**
 * Send keys: the `hm_send_...` bearer credential that authenticates the Send
 * API itself (never a licence key — the Send API never accepts `X-License-Key`,
 * see `requireSendKey` in `middleware/outboundAuth.js`).
 *
 * Redis keys:
 *   outbound:sendkey:<sha256hex>            JSON { accountId, name, createdAt },
 *                                            TTL = account licence's remaining
 *                                            seconds at issue time (no 30-day
 *                                            cap like the `hm_api_...` keys).
 *   outbound:account:<accountId>:sendkeys   SET of sha256 hashes owned by the
 *                                            account (lets list/revoke avoid a
 *                                            Redis KEYS scan).
 *
 * Only the sha256 hash of a send key is ever persisted; the raw key is
 * returned once, at creation, and never stored or logged.
 */

const crypto = require('crypto');

const redisService = require('../redisService');
const licenseService = require('../licenseService');
const accountService = require('./accountService');

const SENDKEY_PREFIX = 'outbound:sendkey:';
const accountSendKeysIndexKey = (accountId) => `outbound:account:${accountId}:sendkeys`;

const hashSendKey = (rawKey) => crypto.createHash('sha256').update(rawKey).digest('hex');

const getActiveLicenseForAccount = async (accountId) => {
  const licenseKey = await redisService.client.get(accountService.accountLicenseKeyIndexKey(accountId));
  const license = licenseKey ? await accountService.getAccountByKey(licenseKey) : null;
  return license && licenseService.isActive(license) ? license : null;
};

const createSendKey = async ({ accountId, name }) => {
  const license = await getActiveLicenseForAccount(accountId);
  if (!license) {
    throw new Error(`Cannot issue a send key for an account with no active licence: ${accountId}`);
  }

  const rawKey = `hm_send_${crypto.randomBytes(24).toString('hex')}`;
  const hash = hashSendKey(rawKey);
  const createdAt = Date.now();
  const ttlSeconds = Math.max(1, Math.ceil((license.expiresAt - Date.now()) / 1000));

  await redisService.client.set(`${SENDKEY_PREFIX}${hash}`, JSON.stringify({ accountId, name, createdAt }));
  await redisService.client.expire(`${SENDKEY_PREFIX}${hash}`, ttlSeconds);
  await redisService.client.sadd(accountSendKeysIndexKey(accountId), hash);

  return { key: rawKey, name, createdAt };
};

const readSendKeyRecord = async (hash) => {
  const raw = await redisService.client.get(`${SENDKEY_PREFIX}${hash}`);
  return raw ? JSON.parse(raw) : null;
};

const listSendKeys = async ({ accountId }) => {
  const hashes = await redisService.client.smembers(accountSendKeysIndexKey(accountId));

  const entries = await Promise.all(
    hashes.map(async (hash) => {
      const record = await readSendKeyRecord(hash);
      if (!record) {
        return null;
      }
      return {
        name: record.name,
        createdAt: record.createdAt,
        maskedKey: `****${hash.slice(-4)}`,
      };
    })
  );

  return entries.filter(Boolean);
};

const revokeSendKey = async ({ accountId, name }) => {
  const hashes = await redisService.client.smembers(accountSendKeysIndexKey(accountId));

  for (const hash of hashes) {
    const record = await readSendKeyRecord(hash);
    if (record && record.name === name) {
      await redisService.client.del(`${SENDKEY_PREFIX}${hash}`);
      await redisService.client.srem(accountSendKeysIndexKey(accountId), hash);
      return true;
    }
  }

  return false;
};

const validateSendKey = async (rawKey) => {
  if (!rawKey || typeof rawKey !== 'string') {
    return null;
  }

  const record = await readSendKeyRecord(hashSendKey(rawKey));
  if (!record) {
    return null;
  }

  return { accountId: record.accountId, name: record.name };
};

module.exports = {
  createSendKey,
  listSendKeys,
  revokeSendKey,
  validateSendKey,
};
