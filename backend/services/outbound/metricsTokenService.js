/**
 * Metrics tokens: `hm_metrics_...` bearer credential for the customer scrape
 * endpoint only (never the Send API). One rotatable token per account.
 *
 * Redis keys:
 *   outbound:metricstoken:<sha256hex>           JSON { accountId, createdAt }
 *   outbound:account:<accountId>:metricsToken   sha256 hex of current token
 */

const crypto = require('crypto');

const redisService = require('../redisService');
const licenseService = require('../licenseService');
const accountService = require('./accountService');

const TOKEN_PREFIX = 'outbound:metricstoken:';
const accountTokenPointerKey = (accountId) => `outbound:account:${accountId}:metricsToken`;

const hashToken = (rawKey) => crypto.createHash('sha256').update(rawKey).digest('hex');

const getActiveLicenseForAccount = async (accountId) => {
  const licenseKey = await redisService.client.get(accountService.accountLicenseKeyIndexKey(accountId));
  const license = licenseKey ? await accountService.getAccountByKey(licenseKey) : null;
  return license && licenseService.isActive(license) ? license : null;
};

const buildScrapeConfig = (credentials) => ({
  job_name: 'hidemail-outbound',
  metrics_path: '/api/outbound/metrics',
  scheme: 'https',
  static_configs: [{ targets: ['send.hide-mail.org'] }],
  ...(credentials
    ? { authorization: { type: 'Bearer', credentials } }
    : { bearerTokenHeader: 'Authorization: Bearer <rotate to reveal>' }),
});

const rotateMetricsToken = async ({ accountId }) => {
  const license = await getActiveLicenseForAccount(accountId);
  if (!license) {
    throw new Error(`Cannot issue a metrics token for an account with no active licence: ${accountId}`);
  }

  const pointerKey = accountTokenPointerKey(accountId);
  const previousHash = await redisService.client.get(pointerKey);
  if (previousHash) {
    await redisService.client.del(`${TOKEN_PREFIX}${previousHash}`);
  }

  const rawKey = `hm_metrics_${crypto.randomBytes(24).toString('hex')}`;
  const hash = hashToken(rawKey);
  const createdAt = Date.now();
  const ttlSeconds = Math.max(1, Math.ceil((license.expiresAt - Date.now()) / 1000));

  await redisService.client.set(
    `${TOKEN_PREFIX}${hash}`,
    JSON.stringify({ accountId, createdAt })
  );
  await redisService.client.expire(`${TOKEN_PREFIX}${hash}`, ttlSeconds);
  await redisService.client.set(pointerKey, hash);

  return {
    key: rawKey,
    createdAt,
    scrapeConfig: buildScrapeConfig(rawKey),
  };
};

const getMetricsTokenMeta = async ({ accountId }) => {
  const hash = await redisService.client.get(accountTokenPointerKey(accountId));
  if (!hash) {
    return null;
  }
  const raw = await redisService.client.get(`${TOKEN_PREFIX}${hash}`);
  if (!raw) {
    return null;
  }
  const record = JSON.parse(raw);
  return {
    createdAt: record.createdAt,
    maskedKey: `****${hash.slice(-4)}`,
    tokenPresent: true,
    scrapeConfig: buildScrapeConfig(null),
  };
};

const validateMetricsToken = async (rawKey) => {
  if (!rawKey || typeof rawKey !== 'string' || !rawKey.startsWith('hm_metrics_')) {
    return null;
  }
  const raw = await redisService.client.get(`${TOKEN_PREFIX}${hashToken(rawKey)}`);
  if (!raw) {
    return null;
  }
  const record = JSON.parse(raw);
  return { accountId: record.accountId };
};

module.exports = {
  rotateMetricsToken,
  getMetricsTokenMeta,
  validateMetricsToken,
};
