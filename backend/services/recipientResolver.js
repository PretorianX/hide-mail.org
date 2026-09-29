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
 * Live route for delivery. A known-but-inactive mailbox stops the search: that address belonged
 * to a mailbox that has expired, and its mail must be dropped rather than fall through to a
 * shorter prefix that is still live.
 */
const resolveActiveRecipient = async (address) => {
  for (const candidate of routeCandidates(address)) {
    if (await redisService.isMailboxActive(candidate.mailbox)) {
      return candidate;
    }

    if (await redisService.isMailboxKnown(candidate.mailbox)) {
      return null;
    }
  }

  return null;
};

/**
 * Same routing, but against mailboxes still inside the post-expiry grace period, so an expired
 * site address is accepted at RCPT TO and then dropped rather than answered with a 550.
 */
const resolveKnownRecipient = (address) =>
  resolve(address, (mailbox) => redisService.isMailboxKnown(mailbox));

module.exports = {
  resolveActiveRecipient,
  resolveKnownRecipient,
};
