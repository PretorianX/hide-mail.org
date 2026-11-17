/**
 * Outbound operator accounts.
 * Each account is an 'outbound' license plus an entry in the Redis set
 * `outbound:accounts:index`, which keeps a lookup of every account's license key.
 */

const licenseService = require('../licenseService');
const redisService = require('../redisService');

const ACCOUNTS_INDEX_KEY = 'outbound:accounts:index';

// Domain code (Task 5+) only has an accountId, not a license key, so it needs
// this reverse index (accountId -> licenseKey) to look up the owning account's
// license when deciding whether a domain's gate record may say maySend: true.
const accountLicenseKeyIndexKey = (accountId) => `outbound:account:${accountId}:licenseKey`;

const createAccount = async ({ label, days }) => {
  const license = await licenseService.createOperatorLicense({ type: 'outbound', days, label });
  await redisService.client.sadd(ACCOUNTS_INDEX_KEY, license.key);
  await redisService.client.set(accountLicenseKeyIndexKey(license.accountId), license.key);
  return { accountId: license.accountId, key: license.key, expiresAt: license.expiresAt };
};

const listAccounts = async () => {
  const keys = await redisService.client.smembers(ACCOUNTS_INDEX_KEY);
  const licenses = await Promise.all(keys.map((key) => licenseService.getLicense(key)));
  return licenses
    .filter((license) => license !== null)
    .map((license) => ({
      accountId: license.accountId,
      key: license.key,
      label: license.label,
      status: license.status,
      expiresAt: license.expiresAt,
      remainingDays: Math.max(0, Math.ceil((license.expiresAt - Date.now()) / (24 * 60 * 60 * 1000))),
    }));
};

const extendAccount = async ({ key, days }) => licenseService.extendOperatorLicense({ key, days });

const getAccountByKey = async (key) => {
  const license = await licenseService.getLicense(key);
  if (!license || license.type !== 'outbound') {
    return null;
  }
  return license;
};

module.exports = {
  createAccount,
  listAccounts,
  extendAccount,
  getAccountByKey,
};
