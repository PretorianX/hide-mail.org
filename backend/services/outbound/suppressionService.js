/**
 * Per-account recipient suppression list.
 *
 * Redis key: outbound:suppression:<accountId>  HASH field=lowercased email
 */

const redisService = require('../redisService');
const { encodeCsv } = require('../../utils/csv');

const suppressionKey = (accountId) => `outbound:suppression:${accountId}`;

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const getSuppression = async ({ accountId, email }) => {
  const field = normalizeEmail(email);
  if (!field) return null;
  const raw = await redisService.client.hget(suppressionKey(accountId), field);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  return {
    email: field,
    reason: parsed.reason,
    errorMessage: parsed.errorMessage ?? null,
    addedAt: parsed.addedAt,
  };
};

const isSuppressed = async ({ accountId, email }) => {
  const entry = await getSuppression({ accountId, email });
  return Boolean(entry);
};

const addSuppression = async ({ accountId, email, reason, errorMessage = null }) => {
  const field = normalizeEmail(email);
  const record = JSON.stringify({
    reason,
    errorMessage: errorMessage || null,
    addedAt: Date.now(),
  });
  await redisService.client.hset(suppressionKey(accountId), field, record);
};

const removeSuppression = async ({ accountId, email }) => {
  const field = normalizeEmail(email);
  const removed = await redisService.client.hdel(suppressionKey(accountId), field);
  return removed > 0;
};

const listSuppressions = async ({ accountId }) => {
  const all = await redisService.client.hgetall(suppressionKey(accountId));
  return Object.entries(all || {}).map(([email, raw]) => {
    const parsed = JSON.parse(raw);
    return {
      email,
      reason: parsed.reason,
      errorMessage: parsed.errorMessage ?? null,
      addedAt: parsed.addedAt,
    };
  });
};

const exportSuppressionsCsv = async ({ accountId }) => {
  const rows = await listSuppressions({ accountId });
  return encodeCsv(
    ['email', 'reason', 'added_at'],
    rows.map((row) => [row.email, row.reason, row.addedAt])
  );
};

module.exports = {
  getSuppression,
  isSuppressed,
  addSuppression,
  removeSuppression,
  listSuppressions,
  exportSuppressionsCsv,
};
