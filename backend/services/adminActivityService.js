/**
 * Cross-account outbound activity for the ops portal.
 * Merges per-account message indexes; never returns licence plaintext or bodies.
 */

const accountService = require('./outbound/accountService');
const messageStore = require('./outbound/messageStore');

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;
const PER_ACCOUNT_FETCH = 100;

const sortKey = (message) => message.lastEventAt || message.createdAt || 0;

const listActivity = async ({ limit = DEFAULT_LIMIT } = {}) => {
  const capped = Math.min(Math.max(1, Number(limit) || DEFAULT_LIMIT), MAX_LIMIT);
  const accounts = await accountService.listAccounts();
  const labelByAccountId = new Map(
    accounts.map((account) => [account.accountId, account.label || null])
  );

  const batches = await Promise.all(
    accounts.map((account) =>
      messageStore.listRecentMessages({
        accountId: account.accountId,
        limit: Math.min(PER_ACCOUNT_FETCH, capped),
      })
    )
  );

  const merged = batches.flat().map((message) => ({
    ...message,
    accountLabel: labelByAccountId.get(message.accountId) || null,
  }));

  merged.sort((a, b) => sortKey(b) - sortKey(a));
  return merged.slice(0, capped);
};

module.exports = {
  listActivity,
  DEFAULT_LIMIT,
  MAX_LIMIT,
};
