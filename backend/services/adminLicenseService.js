/**
 * Operator admin: list / create / revoke product licences (API keys).
 * List responses never include the raw key — only a mask + opaque admin id.
 * Create returns the plaintext once.
 */

const crypto = require('crypto');
const licenseService = require('./licenseService');
const redisService = require('./redisService');
const accountService = require('./outbound/accountService');
const accountRateLimiter = require('./outbound/accountRateLimiter');
const sendKeyService = require('./outbound/sendKeyService');

const INDEX_KEY = 'licenses:admin-index';
const ADMIN_ID_PREFIX = 'licenses:admin-id:';
const ACCOUNT_DAILY_DEFAULT_PREFIX = 'outbound:account:';
const accountDailyDefaultKey = (accountId) =>
  `${ACCOUNT_DAILY_DEFAULT_PREFIX}${accountId}:dailyLimitDefault`;
const adminIdKey = (adminId) => `${ADMIN_ID_PREFIX}${adminId}`;

const LICENSE_TYPES = [
  'pro',
  'api',
  'grade',
  'sender',
  'reports',
  'bounce',
  'complaint',
  'tls',
  'access',
  'suite',
  'outbound',
];

const ensureAdminId = async (license) => {
  if (license.adminId) {
    return license.adminId;
  }
  const adminId = crypto.randomUUID();
  license.adminId = adminId;
  const redisTtl = Math.max(1, Math.ceil((license.expiresAt - Date.now()) / 1000));
  await redisService.client.setex(`license:${license.key}`, redisTtl, JSON.stringify(license));
  await redisService.client.set(adminIdKey(adminId), license.key);
  return adminId;
};

const toPublicRecord = async (license) => {
  if (!license) {
    return null;
  }
  const adminId = await ensureAdminId(license);
  const record = {
    id: adminId,
    maskedKey: licenseService.maskKey(license.key),
    type: license.type,
    status: license.status,
    label: license.label || null,
    plan: license.plan || null,
    accountId: license.accountId || null,
    createdAt: license.createdAt,
    expiresAt: license.expiresAt,
    remainingDays: Math.max(
      0,
      Math.ceil((license.expiresAt - Date.now()) / (24 * 60 * 60 * 1000))
    ),
    ratePerMinute: null,
    dailyLimitDefault: null,
  };

  if (license.type === 'outbound' && license.accountId) {
    record.ratePerMinute = await accountRateLimiter.getLimit(license.accountId);
    record.dailyLimitDefault = await getAccountDailyLimitDefault(license.accountId);
  }

  return record;
};

const rememberKey = async (key) => {
  await redisService.client.sadd(INDEX_KEY, key);
};

const forgetKey = async (key) => {
  await redisService.client.srem(INDEX_KEY, key);
};

const listLicenses = async () => {
  let keys = await redisService.client.smembers(INDEX_KEY);
  if (!keys || keys.length === 0) {
    const discovered = await redisService.client.keys('license:*');
    keys = discovered.map((redisKey) => redisKey.slice('license:'.length));
    if (keys.length > 0) {
      await redisService.client.sadd(INDEX_KEY, ...keys);
    }
  }

  const licenses = await Promise.all(keys.map((key) => licenseService.getLicense(key)));
  const publicRecords = await Promise.all(
    licenses.filter(Boolean).map((license) => toPublicRecord(license))
  );
  return publicRecords
    .filter(Boolean)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
};

const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;

const createLicense = async ({
  type,
  days,
  label,
  plan = 'monthly',
  ratePerMinute,
  dailyLimitDefault,
  issueSendKey = true,
}) => {
  if (!LICENSE_TYPES.includes(type)) {
    const error = new Error(`Unknown license type: ${type}`);
    error.code = 'INVALID_TYPE';
    throw error;
  }
  if (!isPositiveInteger(days)) {
    const error = new Error('days must be a positive integer');
    error.code = 'INVALID_DAYS';
    throw error;
  }

  let license;
  let sendKey;
  let sendKeyName;
  if (type === 'outbound') {
    const created = await accountService.createAccount({
      label: label || 'outbound',
      days,
    });
    license = await licenseService.getLicense(created.key);
    if (ratePerMinute !== undefined && ratePerMinute !== null && ratePerMinute !== '') {
      const rate = Number(ratePerMinute);
      if (!Number.isFinite(rate) || rate <= 0) {
        const error = new Error('ratePerMinute must be a positive number');
        error.code = 'INVALID_RATE';
        throw error;
      }
      await accountRateLimiter.setOverride(created.accountId, rate);
    }
    // Blank / omitted daily limit means unlimited. Leaving the Redis key unset used to
    // look like "unlimited" in the ops list while new domains still stamped the system
    // default (1000) — always persist an explicit value for outbound keys.
    const value =
      dailyLimitDefault === undefined ||
      dailyLimitDefault === null ||
      dailyLimitDefault === '' ||
      dailyLimitDefault === 'unlimited'
        ? 'null'
        : String(Number(dailyLimitDefault));
    if (value !== 'null' && (!Number.isFinite(Number(value)) || Number(value) <= 0)) {
      const error = new Error('dailyLimitDefault must be a positive number or unlimited');
      error.code = 'INVALID_DAILY_LIMIT';
      throw error;
    }
    await redisService.client.set(accountDailyDefaultKey(created.accountId), value);

    if (issueSendKey !== false) {
      const issued = await sendKeyService.createSendKey({
        accountId: created.accountId,
        name: 'default',
      });
      sendKey = issued.key;
      sendKeyName = issued.name;
    }
  } else {
    const ttlSeconds = days * 24 * 60 * 60;
    license = await licenseService.createLicense({
      type,
      plan: plan === 'yearly' ? 'yearly' : 'monthly',
      orderReference: `admin-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`,
      ttlSeconds,
    });
    if (label) {
      license.label = label;
      const redisTtl = Math.max(1, Math.ceil((license.expiresAt - Date.now()) / 1000));
      await redisService.client.setex(
        `license:${license.key}`,
        redisTtl,
        JSON.stringify(license)
      );
    }
  }

  if (!license.adminId) {
    license.adminId = crypto.randomUUID();
    const redisTtl = Math.max(1, Math.ceil((license.expiresAt - Date.now()) / 1000));
    await redisService.client.setex(`license:${license.key}`, redisTtl, JSON.stringify(license));
  }
  await redisService.client.set(adminIdKey(license.adminId), license.key);
  await rememberKey(license.key);
  const publicRecord = await toPublicRecord(license);

  const result = {
    ...publicRecord,
    key: license.key,
  };

  if (licenseService.canIssueApiKey(type)) {
    result.apiKey = await licenseService.createApiKey(license.key);
  }
  if (sendKey) {
    result.sendKey = sendKey;
    result.sendKeyName = sendKeyName;
  }

  return result;
};

const resolveKeyFromAdminId = async (adminIdOrKey) => {
  const mapped = await redisService.client.get(adminIdKey(adminIdOrKey));
  if (mapped) {
    return mapped;
  }
  const direct = await licenseService.getLicense(adminIdOrKey);
  return direct ? adminIdOrKey : null;
};

const deleteLicense = async (adminIdOrKey) => {
  const key = await resolveKeyFromAdminId(adminIdOrKey);
  if (!key) {
    return false;
  }
  const license = await licenseService.getLicense(key);
  if (!license) {
    return false;
  }

  if (license.type === 'outbound') {
    await redisService.client.srem('outbound:accounts:index', key);
    if (license.accountId) {
      await redisService.client.del(`outbound:account:${license.accountId}:licenseKey`);
      await redisService.client.del(accountDailyDefaultKey(license.accountId));
      await redisService.client.del(`outbound:ratelimit:override:${license.accountId}`);
    }
  }

  if (license.adminId) {
    await redisService.client.del(adminIdKey(license.adminId));
  }
  await licenseService.revokeLicense(key);
  await forgetKey(key);
  return true;
};

const getAccountDailyLimitDefault = async (accountId) => {
  const raw = await redisService.client.get(accountDailyDefaultKey(accountId));
  // Missing key and the explicit 'null' sentinel both mean unlimited. Ops must
  // store a positive number to cap new domains (blank create = unlimited).
  if (raw === null || raw === undefined || raw === 'null') {
    return null;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

module.exports = {
  LICENSE_TYPES,
  listLicenses,
  createLicense,
  deleteLicense,
  rememberKey,
  getAccountDailyLimitDefault,
  accountDailyDefaultKey,
};
