/**
 * Outbound sending domains: add/list/check/remove, DNS-record generation,
 * and the "gate record" that ZoneMTA's plugin (mta/) reads before sending.
 *
 * Redis keys (no TTL on the meta/account-index keys — domains don't expire
 * on their own):
 *   outbound:domain:meta:<domain>                JSON meta record
 *   outbound:domain:gate:<domain>                JSON gate record, TTL = account licence's remaining seconds
 *   outbound:account:<accountId>:domains         SET of domain names owned by the account
 */

const crypto = require('crypto');

const config = require('../../config/config');
const redisService = require('../redisService');
const licenseService = require('../licenseService');
const accountService = require('./accountService');
const keyCrypto = require('./keyCrypto');
const { buildExpectedRecords } = require('./domainRecords');
const { verifyDomain } = require('./domainVerifier');

const META_PREFIX = 'outbound:domain:meta:';
const GATE_PREFIX = 'outbound:domain:gate:';
const accountDomainsKey = (accountId) => `outbound:account:${accountId}:domains`;
const accountLicenseKeyIndexKey = (accountId) => `outbound:account:${accountId}:licenseKey`;

class DomainError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

const normalizeDomain = (domain) => String(domain || '').trim().toLowerCase().replace(/\.$/, '');

const readMeta = async (domain) => {
  const raw = await redisService.client.get(`${META_PREFIX}${domain}`);
  return raw ? JSON.parse(raw) : null;
};

const writeMeta = async (domain, meta) => {
  await redisService.client.set(`${META_PREFIX}${domain}`, JSON.stringify(meta));
};

// The gate record is what ZoneMTA's plugin reads on every send; it must never
// outlive the account's own licence, so its TTL always tracks the licence's
// remaining seconds. If the licence is missing/inactive, delete the gate key
// outright rather than writing maySend: false — the plugin treats a missing
// key identically to maySend: false, so there's nothing to gain by keeping a
// stale key alive, and it needs no future cleanup.
const writeGateRecord = async ({ accountId, domain, selector, privateKeyEnc, state, suspended }) => {
  const gateKey = `${GATE_PREFIX}${domain}`;
  const licenseKey = await redisService.client.get(accountLicenseKeyIndexKey(accountId));
  const license = licenseKey ? await accountService.getAccountByKey(licenseKey) : null;

  if (!license || !licenseService.isActive(license)) {
    await redisService.client.del(gateKey);
    return;
  }

  const maySend = state === 'verified' && !suspended;
  const ttlSeconds = Math.max(1, Math.ceil((license.expiresAt - Date.now()) / 1000));

  await redisService.client.set(gateKey, JSON.stringify({ maySend, selector, privateKeyEnc }));
  await redisService.client.expire(gateKey, ttlSeconds);
};

const generateDomainKeyMaterial = () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
};

const addDomain = async ({ accountId, domain: rawDomain }) => {
  const domain = normalizeDomain(rawDomain);
  const existing = await readMeta(domain);

  if (existing) {
    if (existing.accountId !== accountId) {
      throw new DomainError('DOMAIN_TAKEN', `Domain ${domain} is already registered to another account`);
    }
    // Same account re-adding a domain it already owns: idempotent, no
    // regeneration (regenerating the keypair/selector would silently break
    // DNS records the owner may have already published).
    return { domain, selector: existing.selector, records: existing.records, state: existing.state };
  }

  const selector = `hm-${crypto.randomBytes(4).toString('hex')}`;
  const { publicKeyPem, privateKeyPem } = generateDomainKeyMaterial();
  const privateKeyEnc = keyCrypto.encrypt(privateKeyPem, config.outbound.keyEncryptionSecret);
  const records = buildExpectedRecords({ domain, selector, publicKeyPem });

  const meta = {
    accountId,
    selector,
    publicKeyPem,
    privateKeyEnc,
    state: 'pending',
    suspended: false,
    dailyLimit: config.outbound.dailyLimitDefault,
    createdAt: Date.now(),
    lastCheckedAt: null,
    records,
  };

  await writeMeta(domain, meta);
  await redisService.client.sadd(accountDomainsKey(accountId), domain);
  await writeGateRecord({
    accountId,
    domain,
    selector,
    privateKeyEnc,
    state: meta.state,
    suspended: meta.suspended,
  });

  return { domain, selector, records, state: meta.state };
};

const checkDomain = async ({ accountId, domain: rawDomain }) => {
  const domain = normalizeDomain(rawDomain);
  const meta = await readMeta(domain);

  if (!meta || meta.accountId !== accountId) {
    throw new DomainError('NOT_FOUND', `Domain ${domain} not found`);
  }

  const { state, records } = await verifyDomain({
    domain,
    selector: meta.selector,
    publicKeyPem: meta.publicKeyPem,
    previousState: meta.state,
  });

  const updatedMeta = { ...meta, state, records, lastCheckedAt: Date.now() };
  await writeMeta(domain, updatedMeta);
  await writeGateRecord({
    accountId,
    domain,
    selector: meta.selector,
    privateKeyEnc: meta.privateKeyEnc,
    state,
    suspended: meta.suspended,
  });

  return { domain, state, records };
};

const listDomains = async ({ accountId }) => {
  const domains = await redisService.client.smembers(accountDomainsKey(accountId));

  const results = await Promise.all(
    domains.map(async (domain) => {
      const meta = await readMeta(domain);
      if (!meta) return null;
      return {
        domain,
        state: meta.state,
        suspended: meta.suspended,
        dailyLimit: meta.dailyLimit,
      };
    })
  );

  return results.filter(Boolean);
};

const removeDomain = async ({ accountId, domain: rawDomain }) => {
  const domain = normalizeDomain(rawDomain);
  const meta = await readMeta(domain);

  if (!meta || meta.accountId !== accountId) {
    return false;
  }

  await redisService.client.del(`${META_PREFIX}${domain}`);
  await redisService.client.del(`${GATE_PREFIX}${domain}`);
  await redisService.client.srem(accountDomainsKey(accountId), domain);

  return true;
};

module.exports = {
  DomainError,
  addDomain,
  checkDomain,
  listDomains,
  removeDomain,
};
