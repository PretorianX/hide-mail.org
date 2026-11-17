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
const GLOBAL_DOMAINS_INDEX = 'outbound:domains:index';
const accountDomainsKey = (accountId) => `outbound:account:${accountId}:domains`;
// Single source of truth for this key lives in accountService.js (it's the
// one that writes it, in createAccount); import rather than duplicate it.
const { accountLicenseKeyIndexKey } = accountService;

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

// Reached whenever this (or a concurrent) caller loses the atomic claim below
// — either because the domain was already fully registered (sequential case)
// or because another request's claim won a genuine race a moment earlier
// (concurrent case). Same account -> idempotent return of whatever is there;
// different/unknown account -> DOMAIN_TAKEN. `existing` may still be the
// other claimant's minimal in-flight placeholder (valid JSON, `accountId`
// already set, `selector`/`records` not yet) if we lost a very tight race —
// that's fine: ownership is already decidable from `accountId` alone, and a
// same-account caller who hits that sliver of a window simply gets the
// not-yet-complete record back (a follow-up call sees the finished one).
const resolveExistingDomainClaim = ({ accountId, domain, existing }) => {
  if (!existing) {
    // The claim failed but there's nothing to read back (the other claimant
    // hasn't written even its placeholder yet, or raced us on a delete) —
    // never silently proceed as if we'd won; report it as taken.
    throw new DomainError('DOMAIN_TAKEN', `Domain ${domain} is already being registered`);
  }
  if (existing.accountId !== accountId) {
    throw new DomainError('DOMAIN_TAKEN', `Domain ${domain} is already registered to another account`);
  }
  return { domain, selector: existing.selector, records: existing.records, state: existing.state };
};

const addDomain = async ({ accountId, domain: rawDomain }) => {
  const domain = normalizeDomain(rawDomain);
  const metaKey = `${META_PREFIX}${domain}`;

  // Atomically claim the domain name with a conditional (NX) write before
  // generating/encrypting anything. A plain read-then-write (the previous
  // approach) lets two concurrent addDomain calls for the SAME brand-new
  // domain both observe "no existing meta" and both proceed, with the second
  // write silently clobbering the first. SET ... NX is atomic in real Redis
  // (and in the test mock, see __mocks__/ioredis.js), so only one caller can
  // ever win it for a given key.
  const claimPlaceholder = JSON.stringify({ accountId, state: 'pending' });
  const claimed = await redisService.client.set(metaKey, claimPlaceholder, 'NX');

  if (!claimed) {
    const existing = await readMeta(domain);
    return resolveExistingDomainClaim({ accountId, domain, existing });
  }

  try {
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
    await writeGateRecord({
      accountId,
      domain,
      selector,
      privateKeyEnc,
      state: meta.state,
      suspended: meta.suspended,
    });
    await redisService.client.sadd(accountDomainsKey(accountId), domain);
    await redisService.client.sadd(GLOBAL_DOMAINS_INDEX, domain);

    return { domain, selector, records, state: meta.state };
  } catch (error) {
    // Don't leave a half-finished claim permanently blocking this domain
    // name if key generation/encryption/persistence fails partway through.
    await redisService.client.del(metaKey);
    throw error;
  }
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
        selector: meta.selector,
        records: meta.records || [],
        lastCheckedAt: meta.lastCheckedAt ?? null,
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
  await redisService.client.srem(GLOBAL_DOMAINS_INDEX, domain);

  return true;
};

const getDomainMeta = async (domain) => readMeta(domain);

const setSuspended = async ({ domain: rawDomain, suspended }) => {
  const domain = normalizeDomain(rawDomain);
  const meta = await readMeta(domain);
  if (!meta) {
    throw new DomainError('NOT_FOUND', `Domain ${domain} not found`);
  }
  meta.suspended = Boolean(suspended);
  await writeMeta(domain, meta);
  await writeGateRecord({
    accountId: meta.accountId,
    domain,
    selector: meta.selector,
    privateKeyEnc: meta.privateKeyEnc,
    state: meta.state,
    suspended: meta.suspended,
  });
};

module.exports = {
  DomainError,
  addDomain,
  checkDomain,
  listDomains,
  removeDomain,
  getDomainMeta,
  setSuspended,
};
