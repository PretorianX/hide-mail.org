/**
 * Outbound sending domains: add/list/check/remove and DNS-record generation.
 * Meta holds the encrypted DKIM private key; the backend signs before Postfix.
 * Gate records remain written for licence TTL bookkeeping (no ZoneMTA consumer).
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
const { getAccountDailyLimitDefault } = require('../adminLicenseService');
const licenseService = require('../licenseService');
const accountService = require('./accountService');
const keyCrypto = require('./keyCrypto');
const { buildExpectedRecords } = require('./domainRecords');
const { verifyDomain } = require('./domainVerifier');

const META_PREFIX = 'outbound:domain:meta:';
const GATE_PREFIX = 'outbound:domain:gate:';
const GLOBAL_DOMAINS_INDEX = 'outbound:domains:index';
const accountDomainsKey = (accountId) => `outbound:account:${accountId}:domains`;
const accountDomainLockKey = (accountId) => `outbound:account:${accountId}:domain_lock`;
const ACCOUNT_DOMAIN_LOCK_TTL_SECONDS = 10;
const ACCOUNT_DOMAIN_LOCK_WAIT_MS = 5000;
const ACCOUNT_DOMAIN_LOCK_RETRY_MS = 10;
const accountLockQueues = new Map();
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

const pendingDomainTtlSeconds = () =>
  Math.max(1, Math.ceil(config.outbound.pendingDomainTtlSeconds));

const remainingPendingTtlSeconds = (meta) => {
  const fullTtlMs = pendingDomainTtlSeconds() * 1000;
  if (typeof meta?.createdAt === 'number') {
    const remainingMs = meta.createdAt + fullTtlMs - Date.now();
    return Math.max(1, Math.ceil(remainingMs / 1000));
  }
  return pendingDomainTtlSeconds();
};

const writeMeta = async (domain, meta) => {
  const key = `${META_PREFIX}${domain}`;
  const value = JSON.stringify(meta);
  if (meta.state === 'pending') {
    await redisService.client.setex(key, remainingPendingTtlSeconds(meta), value);
    return;
  }
  await redisService.client.set(key, value);
};

const isAccountLicenseActive = async (accountId) => {
  if (!accountId) return false;
  const licenseKey = await redisService.client.get(accountLicenseKeyIndexKey(accountId));
  if (!licenseKey) return false;
  const license = await accountService.getAccountByKey(licenseKey);
  return Boolean(license && licenseService.isActive(license));
};

const isPendingExpired = (existing) =>
  Boolean(
    existing &&
      existing.state === 'pending' &&
      typeof existing.createdAt === 'number' &&
      Date.now() - existing.createdAt >= pendingDomainTtlSeconds() * 1000
  );

const isClaimExpiredOrUnlicensed = async (existing) => {
  if (!existing) return true;
  if (isPendingExpired(existing)) {
    return true;
  }
  if (existing.accountId && !(await isAccountLicenseActive(existing.accountId))) {
    return true;
  }
  return false;
};

const cleanupStaleClaim = async (domain, existing) => {
  await redisService.client.del(`${META_PREFIX}${domain}`);
  await redisService.client.del(`${GATE_PREFIX}${domain}`);
  if (existing?.accountId) {
    await redisService.client.srem(accountDomainsKey(existing.accountId), domain);
  }
  await redisService.client.srem(GLOBAL_DOMAINS_INDEX, domain);
};

const countLiveAccountDomains = async (accountId, excludeDomain) => {
  const domains = await redisService.client.smembers(accountDomainsKey(accountId));
  let count = 0;
  for (const d of domains) {
    if (d === excludeDomain) continue;
    const meta = await readMeta(d);
    if (!meta || (await isClaimExpiredOrUnlicensed(meta))) {
      await redisService.client.srem(accountDomainsKey(accountId), d);
      if (meta) {
        await cleanupStaleClaim(d, meta);
      }
      continue;
    }
    count += 1;
  }
  return count;
};

// The gate record carries maySend + encrypted key material; it must never
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

// Serialize per-account quota checks + account-set reservation both in-process
// and across processes (Redis SET NX lock) so concurrent addDomain calls for
// distinct domains cannot all pass countLiveAccountDomains before any SADD.
const withInProcessAccountLock = async (accountId, fn) => {
  const prev = accountLockQueues.get(accountId) || Promise.resolve();
  let release;
  const next = new Promise((resolve) => {
    release = resolve;
  });
  const tail = prev.then(() => next);
  accountLockQueues.set(accountId, tail);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (accountLockQueues.get(accountId) === tail) {
      accountLockQueues.delete(accountId);
    }
  }
};

const withAccountDomainLock = (accountId, fn) =>
  withInProcessAccountLock(accountId, async () => {
    const lockKey = accountDomainLockKey(accountId);
    const lockToken = crypto.randomBytes(16).toString('hex');
    const deadline = Date.now() + ACCOUNT_DOMAIN_LOCK_WAIT_MS;
    let acquired = null;

    while (!acquired) {
      acquired = await redisService.client.set(
        lockKey,
        lockToken,
        'EX',
        ACCOUNT_DOMAIN_LOCK_TTL_SECONDS,
        'NX'
      );
      if (acquired) break;
      if (Date.now() >= deadline) {
        throw new DomainError(
          'DOMAIN_LOCK_TIMEOUT',
          `Timed out waiting for account ${accountId} domain quota lock`
        );
      }
      await new Promise((resolve) => setTimeout(resolve, ACCOUNT_DOMAIN_LOCK_RETRY_MS));
    }

    try {
      return await fn();
    } finally {
      const current = await redisService.client.get(lockKey);
      if (current === lockToken) {
        await redisService.client.del(lockKey);
      }
    }
  });

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
  const pendingTtl = pendingDomainTtlSeconds();
  let claimed = await redisService.client.set(metaKey, claimPlaceholder, 'EX', pendingTtl, 'NX');

  if (!claimed) {
    const existing = await readMeta(domain);
    if (existing && (await isClaimExpiredOrUnlicensed(existing))) {
      await cleanupStaleClaim(domain, existing);
      claimed = await redisService.client.set(metaKey, claimPlaceholder, 'EX', pendingTtl, 'NX');
    }
    if (!claimed) {
      const current = existing && !(await isClaimExpiredOrUnlicensed(existing))
        ? existing
        : await readMeta(domain);
      return resolveExistingDomainClaim({ accountId, domain, existing: current });
    }
  }

  let reservedInAccountSet = false;
  try {
    await withAccountDomainLock(accountId, async () => {
      const liveCount = await countLiveAccountDomains(accountId, domain);
      if (liveCount >= config.outbound.maxDomainsPerAccount) {
        throw new DomainError(
          'DOMAIN_QUOTA_EXCEEDED',
          `Account has reached the maximum of ${config.outbound.maxDomainsPerAccount} domains`
        );
      }
      // Reserve the slot in the account set before releasing the lock so
      // subsequent concurrent addDomain calls for other names see it.
      await redisService.client.sadd(accountDomainsKey(accountId), domain);
      reservedInAccountSet = true;
    });

    const selector = `hm-${crypto.randomBytes(4).toString('hex')}`;
    const { publicKeyPem, privateKeyPem } = generateDomainKeyMaterial();
    const privateKeyEnc = keyCrypto.encrypt(privateKeyPem, config.outbound.keyEncryptionSecret);
    const records = buildExpectedRecords({ domain, selector, publicKeyPem });

    const dailyLimit = await getAccountDailyLimitDefault(accountId);

    const meta = {
      accountId,
      selector,
      publicKeyPem,
      privateKeyEnc,
      state: 'pending',
      suspended: false,
      dailyLimit,
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
    await redisService.client.sadd(GLOBAL_DOMAINS_INDEX, domain);

    return { domain, selector, records, state: meta.state };
  } catch (error) {
    // Don't leave a half-finished claim or account-set reservation
    // permanently blocking this domain name or consuming quota if
    // quota check or key generation/encryption/persistence fails.
    await redisService.client.del(metaKey);
    if (reservedInAccountSet) {
      await redisService.client.srem(accountDomainsKey(accountId), domain);
    }
    throw error;
  }
};

const checkDomain = async ({ accountId, domain: rawDomain }) => {
  const domain = normalizeDomain(rawDomain);
  const meta = await readMeta(domain);

  if (!meta || meta.accountId !== accountId) {
    throw new DomainError('NOT_FOUND', `Domain ${domain} not found`);
  }

  // Unlimited accounts clear a mistaken 1000/day stamp; numeric account defaults
  // leave any per-domain override (CLI) alone.
  const accountDailyDefault = await getAccountDailyLimitDefault(accountId);
  const dailyLimit = accountDailyDefault === null ? null : meta.dailyLimit;

  const expected = buildExpectedRecords({
    domain,
    selector: meta.selector,
    publicKeyPem: meta.publicKeyPem,
  });
  const { state, records: checkResults } = await verifyDomain({
    domain,
    selector: meta.selector,
    publicKeyPem: meta.publicKeyPem,
    previousState: meta.state,
  });
  // Merge expected DNS defs (type/host/value) with per-check status for the portal.
  const records = expected.map((def) => {
    const result = checkResults.find((entry) => entry.id === def.id) || {};
    return {
      ...def,
      ...result,
      value: def.expected,
    };
  });

  const updatedMeta = { ...meta, dailyLimit, state, records, lastCheckedAt: Date.now() };
  await writeMeta(domain, updatedMeta);
  await writeGateRecord({
    accountId,
    domain,
    selector: meta.selector,
    privateKeyEnc: meta.privateKeyEnc,
    state,
    suspended: meta.suspended,
  });

  return { domain, state, records, dailyLimit };
};

const listDomains = async ({ accountId }) => {
  const domains = await redisService.client.smembers(accountDomainsKey(accountId));

  const results = await Promise.all(
    domains.map(async (domain) => {
      const meta = await readMeta(domain);
      if (!meta || isPendingExpired(meta)) {
        await redisService.client.srem(accountDomainsKey(accountId), domain);
        if (meta) {
          await cleanupStaleClaim(domain, meta);
        }
        return null;
      }
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

const releaseDomain = async ({ domain: rawDomain }) => {
  const domain = normalizeDomain(rawDomain);
  const meta = await readMeta(domain);
  if (!meta) {
    throw new DomainError('NOT_FOUND', `Domain ${domain} not found`);
  }
  await cleanupStaleClaim(domain, meta);
  return { domain, previousAccountId: meta.accountId };
};

const transferDomain = async ({ domain: rawDomain, toAccountId }) => {
  const domain = normalizeDomain(rawDomain);
  const meta = await readMeta(domain);
  if (!meta) {
    throw new DomainError('NOT_FOUND', `Domain ${domain} not found`);
  }
  if (!(await isAccountLicenseActive(toAccountId))) {
    throw new DomainError('NOT_FOUND', `Target account ${toAccountId} not found or inactive`);
  }

  const fromAccountId = meta.accountId;
  if (fromAccountId && fromAccountId !== toAccountId) {
    await redisService.client.srem(accountDomainsKey(fromAccountId), domain);
  }

  const updated = { ...meta, accountId: toAccountId };
  await writeMeta(domain, updated);
  await writeGateRecord({
    accountId: toAccountId,
    domain,
    selector: updated.selector,
    privateKeyEnc: updated.privateKeyEnc,
    state: updated.state,
    suspended: updated.suspended,
  });
  await redisService.client.sadd(accountDomainsKey(toAccountId), domain);
  await redisService.client.sadd(GLOBAL_DOMAINS_INDEX, domain);

  return { domain, fromAccountId, toAccountId };
};

module.exports = {
  DomainError,
  addDomain,
  checkDomain,
  listDomains,
  removeDomain,
  getDomainMeta,
  setSuspended,
  releaseDomain,
  transferDomain,
};
