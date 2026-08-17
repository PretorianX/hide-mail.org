/**
 * Opaque Pro/API license keys stored in Redis. No user accounts.
 * Restore = paste the key. Webhooks create, renew, or revoke keys.
 */

const crypto = require('crypto');
const redisService = require('./redisService');
const logger = require('../utils/logger');
const config = require('../config/config');
const { sanitizeForLog } = require('../utils/sanitize');

const LICENSE_PREFIX = 'license:';
const ORDER_PREFIX = 'billing:order:';
const RECTOKEN_PREFIX = 'billing:rectoken:';
const API_KEY_PREFIX = 'api_key:';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const randomGroup = (length) => {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  }
  return out;
};

const generateLicenseKey = () =>
  `HM-${randomGroup(4)}-${randomGroup(4)}-${randomGroup(4)}-${randomGroup(4)}`;

// A license key is the only credential a Pro user has, so logs keep the last group only.
const maskKey = (key) => {
  const str = sanitizeForLog(key);
  return str.length <= 4 ? '****' : `****${str.slice(-4)}`;
};

const remainingDays = (expiresAt, now = Date.now()) =>
  Math.max(0, Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000)));

const generateApiKey = () => `hm_api_${crypto.randomBytes(24).toString('hex')}`;

const setWithTtl = async (key, value, ttlSeconds) => {
  await redisService.client.set(key, value);
  await redisService.client.expire(key, ttlSeconds);
};

const persistLicense = async (license, ttlSeconds) => {
  await setWithTtl(`${LICENSE_PREFIX}${license.key}`, JSON.stringify(license), ttlSeconds);
  if (license.orderReference) {
    await setWithTtl(`${ORDER_PREFIX}${license.orderReference}`, license.key, ttlSeconds);
  }
  if (license.recToken) {
    await setWithTtl(`${RECTOKEN_PREFIX}${license.recToken}`, license.key, ttlSeconds);
  }
  return license;
};

const getLicense = async (key) => {
  if (!key || typeof key !== 'string') {
    return null;
  }
  const raw = await redisService.client.get(`${LICENSE_PREFIX}${key}`);
  if (!raw) {
    return null;
  }
  return JSON.parse(raw);
};

const isActive = (license) => {
  if (!license || license.status !== 'active') {
    return false;
  }
  return license.expiresAt > Date.now();
};

const createLicense = async ({ type, plan, orderReference, recToken, ttlSeconds }) => {
  if (type !== 'pro' && type !== 'api') {
    throw new Error(`Unknown license type: ${type}`);
  }
  if (plan !== 'monthly' && plan !== 'yearly') {
    throw new Error(`Unknown plan: ${plan}`);
  }

  const now = Date.now();
  const license = {
    key: generateLicenseKey(),
    type,
    plan,
    status: 'active',
    orderReference,
    recToken: recToken || null,
    createdAt: now,
    expiresAt: now + ttlSeconds * 1000,
  };

  await persistLicense(license, ttlSeconds);
  logger.info(`License created type=${type} plan=${plan} order=${sanitizeForLog(orderReference)}`);
  return license;
};

const validateLicense = async (key) => {
  const license = await getLicense(key);
  if (!isActive(license)) {
    return { active: false };
  }
  return {
    active: true,
    key: license.key,
    type: license.type,
    plan: license.plan,
    expiresAt: license.expiresAt,
    remainingDays: remainingDays(license.expiresAt),
    orderReference: license.orderReference,
  };
};

const findByOrderReference = async (orderReference) => {
  if (!orderReference) {
    return null;
  }
  const key = await redisService.client.get(`${ORDER_PREFIX}${orderReference}`);
  if (!key) {
    return null;
  }
  return getLicense(key);
};

const findByRecToken = async (recToken) => {
  if (!recToken) {
    return null;
  }
  const key = await redisService.client.get(`${RECTOKEN_PREFIX}${recToken}`);
  if (!key) {
    return null;
  }
  return getLicense(key);
};

const renewByPayment = async ({ orderReference, recToken, ttlSeconds }) => {
  const existing = (await findByRecToken(recToken)) || (await findByOrderReference(orderReference));
  if (!existing) {
    return null;
  }

  const base = Math.max(existing.expiresAt, Date.now());
  existing.expiresAt = base + ttlSeconds * 1000;
  existing.status = 'active';
  existing.orderReference = orderReference;
  if (recToken) {
    existing.recToken = recToken;
  }

  const redisTtl = Math.max(1, Math.ceil((existing.expiresAt - Date.now()) / 1000));
  await persistLicense(existing, redisTtl);
  logger.info(`License renewed key=${maskKey(existing.key)} order=${sanitizeForLog(orderReference)}`);
  return existing;
};

const revokeLicense = async (key) => {
  const license = await getLicense(key);
  if (!license) {
    return false;
  }
  await redisService.client.del(`${LICENSE_PREFIX}${key}`);
  if (license.orderReference) {
    await redisService.client.del(`${ORDER_PREFIX}${license.orderReference}`);
  }
  if (license.recToken) {
    await redisService.client.del(`${RECTOKEN_PREFIX}${license.recToken}`);
  }
  logger.info(`License revoked key=${maskKey(key)}`);
  return true;
};

const revokeByPayment = async ({ orderReference, recToken }) => {
  const existing = (await findByOrderReference(orderReference)) || (await findByRecToken(recToken));
  if (!existing) {
    return false;
  }
  return revokeLicense(existing.key);
};

const createApiKey = async (licenseKey) => {
  const license = await getLicense(licenseKey);
  if (!isActive(license) || license.type !== 'api') {
    throw new Error('API keys can only be issued for an active API license');
  }
  const apiKey = generateApiKey();
  const licenseRemainingSeconds = Math.max(1, Math.ceil((license.expiresAt - Date.now()) / 1000));
  const ttlSeconds = Math.min(config.billing.apiKeyTtlSeconds, licenseRemainingSeconds);
  const expiresAt = Date.now() + ttlSeconds * 1000;
  await setWithTtl(
    `${API_KEY_PREFIX}${apiKey}`,
    JSON.stringify({
      licenseKey: license.key,
      type: license.type,
      expiresAt,
    }),
    ttlSeconds
  );
  return apiKey;
};

const validateApiKey = async (apiKey) => {
  if (!apiKey || typeof apiKey !== 'string') {
    return null;
  }
  const raw = await redisService.client.get(`${API_KEY_PREFIX}${apiKey}`);
  if (!raw) {
    return null;
  }
  const parsed = JSON.parse(raw);
  const license = await getLicense(parsed.licenseKey);
  if (!isActive(license)) {
    return null;
  }
  const expiresAt = parsed.expiresAt || license.expiresAt;
  if (expiresAt <= Date.now()) {
    return null;
  }
  return {
    licenseKey: license.key,
    type: license.type,
    license,
    expiresAt,
    remainingDays: remainingDays(expiresAt),
  };
};

module.exports = {
  generateLicenseKey,
  maskKey,
  createLicense,
  getLicense,
  isActive,
  validateLicense,
  findByOrderReference,
  findByRecToken,
  renewByPayment,
  revokeLicense,
  revokeByPayment,
  createApiKey,
  validateApiKey,
};
