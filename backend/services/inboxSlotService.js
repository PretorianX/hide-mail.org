const redisService = require('./redisService');
const logger = require('../utils/logger');
const { sanitizeEmail } = require('../utils/sanitize');

const KEY_PREFIX = 'inbox_slots:';

// The group key outlives its longest mailbox by an hour so that a browser coming back to a group
// whose last inbox just expired still gets an empty, well formed answer instead of nothing.
const GROUP_TTL_GRACE_SECONDS = 3600;

class InboxSlotError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'InboxSlotError';
    this.code = code;
  }
}

const groupKey = (groupId) => `${KEY_PREFIX}${groupId}`;

const redis = () => redisService.client;

/**
 * The group key is worthless without live members, so its lifetime is derived from them on every
 * read and every mutation. An empty group is deleted outright.
 */
const syncGroupTtl = async (key, longestMemberSeconds) => {
  if (longestMemberSeconds <= 0) {
    await redis().del(key);
    return;
  }
  await redis().expire(key, longestMemberSeconds + GROUP_TTL_GRACE_SECONDS);
};

const longestLifetime = (slots) =>
  slots.reduce((max, slot) => Math.max(max, slot.remainingSeconds), 0);

const describeSlot = async (email) => {
  const remainingSeconds = await redisService.getMailboxTtl(email);
  if (remainingSeconds <= 0) {
    return null;
  }
  const meta = await redisService.getMailboxMeta(email);
  return {
    email,
    remainingSeconds,
    // Absent for mailboxes registered before slots existed; the countdown uses remainingSeconds
    // and only the extend button cares about the lifetime that was originally chosen.
    lifetimeSeconds: meta && meta.lifetimeSeconds ? meta.lifetimeSeconds : null,
  };
};

const inboxSlotService = {
  InboxSlotError,

  /**
   * Live inboxes held by a group, oldest first. Members whose mailbox lease is gone are removed
   * as they are found, so an expired inbox leaves the strip and gives its allowance back without
   * any separate sweep.
   *
   * @param {string} groupId
   * @returns {Promise<Array<{email: string, remainingSeconds: number, lifetimeSeconds: number|null}>>}
   */
  async listSlots(groupId) {
    const key = groupKey(groupId);
    const members = await redis().zrange(key, 0, -1);

    const slots = [];
    const stale = [];
    for (const email of members) {
      const slot = await describeSlot(email);
      if (slot) {
        slots.push(slot);
      } else {
        stale.push(email);
      }
    }

    if (stale.length > 0) {
      await redis().zrem(key, ...stale);
      logger.info(`Inbox slots pruned for group ${groupId}: ${stale.length}`);
    }
    await syncGroupTtl(key, longestLifetime(slots));

    return slots;
  },

  /**
   * Take one of the group's slots for an address. Called before the mailbox lease is written, so
   * a refused claim cannot leave a registered mailbox behind. A claim whose registration then
   * fails is pruned by the next listSlots.
   *
   * @throws {InboxSlotError} code SLOT_LIMIT when the group is already full
   */
  async claimSlot(groupId, email, { limit, ttlSeconds }) {
    const live = await this.listSlots(groupId);

    if (live.length >= limit) {
      throw new InboxSlotError(
        'SLOT_LIMIT',
        `This browser already keeps ${limit} inboxes open`
      );
    }

    const key = groupKey(groupId);
    await redis().zadd(key, Date.now(), email);
    await syncGroupTtl(key, Math.max(longestLifetime(live), ttlSeconds));
    logger.info(`Inbox slot claimed: ${sanitizeEmail(email)} (${live.length + 1}/${limit})`);

    return { used: live.length + 1, limit };
  },

  /**
   * Give a slot back. Membership is checked first, so a group can only ever release an address
   * it opened itself.
   *
   * @throws {InboxSlotError} code SLOT_NOT_FOUND when the address is not in the group
   */
  async releaseSlot(groupId, email) {
    const key = groupKey(groupId);
    const removed = await redis().zrem(key, email);

    if (removed === 0) {
      throw new InboxSlotError('SLOT_NOT_FOUND', 'This browser does not hold that inbox');
    }

    await this.listSlots(groupId);
    logger.info(`Inbox slot released: ${sanitizeEmail(email)}`);
  },
};

module.exports = inboxSlotService;
