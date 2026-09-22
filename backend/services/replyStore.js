/**
 * Reply state held in Redis, all of it bound to the mailbox lease.
 *
 * Two pieces:
 *   reply_quota:{mailbox}             how many replies this address has already sent
 *   reply_sent:{mailbox}:{messageId}  what was sent, so the user can re-read their own answer
 *
 * Both inherit the TTL of `active_mailbox:{mailbox}`, so a quota cannot outlive the address it
 * limits and a sent reply disappears with the inbox that produced it.
 */

const redisService = require('./redisService');

const QUOTA_PREFIX = 'reply_quota:';
const SENT_PREFIX = 'reply_sent:';

const normalize = (mailbox) => String(mailbox).toLowerCase();

const quotaKey = (mailbox) => `${QUOTA_PREFIX}${normalize(mailbox)}`;

const sentKey = (mailbox, messageId) => `${SENT_PREFIX}${normalize(mailbox)}:${messageId}`;

/** Copy the mailbox lease onto a reply key so the two expire together. */
const inheritMailboxTtl = async (key, mailbox) => {
  const ttl = await redisService.getMailboxTtl(normalize(mailbox));
  if (ttl > 0) {
    await redisService.client.expire(key, ttl);
  }
};

const getQuota = async (mailbox, limit) => {
  const stored = await redisService.client.get(quotaKey(mailbox));
  const used = parseInt(stored, 10) || 0;
  return {
    limit,
    used,
    remaining: Math.max(0, limit - used),
    canReply: used < limit,
  };
};

const consumeQuota = async (mailbox) => {
  const key = quotaKey(mailbox);
  const used = await redisService.client.incr(key);
  await inheritMailboxTtl(key, mailbox);
  return used;
};

const recordReply = async (mailbox, messageId, entry) => {
  const key = sentKey(mailbox, messageId);
  await redisService.client.rpush(key, JSON.stringify(entry));
  await inheritMailboxTtl(key, mailbox);
};

const listReplies = async (mailbox, messageId) => {
  const stored = await redisService.client.lrange(sentKey(mailbox, messageId), 0, -1);
  return stored.map((item) => JSON.parse(item));
};

module.exports = {
  getQuota,
  consumeQuota,
  recordReply,
  listReplies,
};
