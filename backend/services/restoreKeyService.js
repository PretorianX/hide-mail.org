/**
 * Inbox restore keys.
 *
 * A mailbox only exists in the browser that created it. A restore key is a short code that
 * points at the mailbox server-side, so the address can be reopened on another device until the
 * mailbox expires. The key carries the mailbox TTL and nothing else — no license, no messages.
 *
 * Redis keys:
 * - mailbox_restore:{key}       -> mailbox address
 * - mailbox_restore_key:{email} -> key, so it can be shown again, rotated and TTL-synced
 */

const logger = require('../utils/logger');
const { sanitizeEmail } = require('../utils/sanitize');
const codec = require('../utils/restoreKeyCodec');
const redisService = require('./redisService');

const KEY_PREFIXES = {
  BY_KEY: 'mailbox_restore:',
  BY_MAILBOX: 'mailbox_restore_key:',
};

const byKey = (key) => `${KEY_PREFIXES.BY_KEY}${key}`;
const byMailbox = (email) => `${KEY_PREFIXES.BY_MAILBOX}${email}`;

const normalizeMailbox = (email) => String(email || '').toLowerCase();

const storedKeyFor = async (email) => redisService.client.get(byMailbox(email));

/**
 * The lease left on the mailbox, or null when it is gone or has no expiry. Restore keys are
 * only meaningful for a mailbox that expires, since the key must expire with it.
 * @param {string} email
 * @returns {Promise<number|null>}
 */
const mailboxTtl = async (email) => {
  const ttl = await redisService.getMailboxTtl(email);
  return ttl > 0 ? ttl : null;
};

/**
 * Issue the restore key for an active mailbox. Idempotent unless a rotation is asked for, so
 * reopening the panel shows the same key rather than invalidating the one already copied.
 *
 * @param {string} mailbox
 * @param {{ rotate?: boolean }} [options]
 * @returns {Promise<{ key: string, email: string, ttlSeconds: number, created: boolean }>}
 * @throws {Error} `MAILBOX_NOT_ACTIVE` when the mailbox cannot hold a key.
 */
const issue = async (mailbox, options = {}) => {
  const email = normalizeMailbox(mailbox);

  if (!(await redisService.isMailboxActive(email))) {
    throw new Error('MAILBOX_NOT_ACTIVE');
  }

  const ttlSeconds = await mailboxTtl(email);
  if (!ttlSeconds) {
    throw new Error('MAILBOX_NOT_ACTIVE');
  }

  const existing = await storedKeyFor(email);

  if (existing && !options.rotate) {
    return { key: codec.format(existing), email, ttlSeconds, created: false };
  }

  if (existing) {
    await redisService.client.del(byKey(existing));
  }

  const key = codec.generate();
  const stored = codec.normalize(key);

  await redisService.client.set(byKey(stored), email, 'EX', ttlSeconds);
  await redisService.client.set(byMailbox(email), stored, 'EX', ttlSeconds);

  logger.info(`Restore key issued for ${sanitizeEmail(email)} (${ttlSeconds}s)`);

  return { key, email, ttlSeconds, created: true };
};

/**
 * Resolve a key a user typed into the mailbox it points at.
 *
 * @param {*} input Key as typed.
 * @returns {Promise<{ email: string, ttlSeconds: number }|null>} Null when the key is malformed,
 *   unknown, or points at a mailbox that has already expired.
 */
const redeem = async (input) => {
  const key = codec.normalize(input);
  if (!key) {
    return null;
  }

  const email = await redisService.client.get(byKey(key));
  if (!email) {
    return null;
  }

  const ttlSeconds = await mailboxTtl(email);
  if (!ttlSeconds) {
    await redisService.client.del(byKey(key));
    await redisService.client.del(byMailbox(email));
    return null;
  }

  logger.info(`Restore key redeemed for ${sanitizeEmail(email)}`);

  return { email, ttlSeconds };
};

/**
 * @param {string} mailbox
 * @returns {Promise<string|null>} The live key in display form.
 */
const peek = async (mailbox) => {
  const stored = await storedKeyFor(normalizeMailbox(mailbox));
  return stored ? codec.format(stored) : null;
};

/**
 * @param {string} mailbox
 * @returns {Promise<boolean>} True when a key was removed.
 */
const revoke = async (mailbox) => {
  const email = normalizeMailbox(mailbox);
  const stored = await storedKeyFor(email);

  if (!stored) {
    return false;
  }

  await redisService.client.del(byKey(stored));
  await redisService.client.del(byMailbox(email));
  logger.info(`Restore key revoked for ${sanitizeEmail(email)}`);

  return true;
};

/**
 * Keep the key's lifetime equal to the mailbox's after the lease moves.
 * @param {string} mailbox
 * @param {number} ttlSeconds
 */
const syncTtl = async (mailbox, ttlSeconds) => {
  const email = normalizeMailbox(mailbox);
  const stored = await storedKeyFor(email);

  if (!stored || !(ttlSeconds > 0)) {
    return;
  }

  await redisService.client.expire(byKey(stored), ttlSeconds);
  await redisService.client.expire(byMailbox(email), ttlSeconds);
};

module.exports = {
  issue,
  redeem,
  peek,
  revoke,
  syncTtl,
};
