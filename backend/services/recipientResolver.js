const redisService = require('./redisService');
const { routeCandidates } = require('./subAddressing');

const resolve = async (address, mailboxExists) => {
  for (const candidate of routeCandidates(address)) {
    if (await mailboxExists(candidate.mailbox)) {
      return candidate;
    }
  }

  return null;
};

/**
 * The mailbox that should receive mail addressed to `address`, or null when none is live.
 * @param {string} address - Recipient address as the sender spelled it
 * @returns {Promise<{mailbox: string, label: string|null}|null>}
 */
const resolveActiveRecipient = (address) =>
  resolve(address, (mailbox) => redisService.isMailboxActive(mailbox));

/**
 * Same routing, but against mailboxes still inside the post-expiry grace period, so an expired
 * site address is accepted and dropped rather than answered with a 550.
 */
const resolveKnownRecipient = (address) =>
  resolve(address, (mailbox) => redisService.isMailboxKnown(mailbox));

module.exports = {
  resolveActiveRecipient,
  resolveKnownRecipient,
};
