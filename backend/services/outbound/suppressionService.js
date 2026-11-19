/**
 * Per-account recipient suppression list.
 *
 * Redis key: outbound:suppression:<accountId>  HASH field=lowercased email
 */

const redisService = require('../redisService');
const { encodeCsv } = require('../../utils/csv');

const suppressionKey = (accountId) => `outbound:suppression:${accountId}`;

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const isSuppressed = async ({ accountId, email }) => {
  const field = normalizeEmail(email);
  if (!field) return false;
  const raw = await redisService.client.hget(suppressionKey(accountId), field);
  return Boolean(raw);
};

const addSuppression = async ({ accountId, email, reason }) => {
  const field = normalizeEmail(email);
  const record = JSON.stringify({ reason, addedAt: Date.now() });
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
    return { email, reason: parsed.reason, addedAt: parsed.addedAt };
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
  isSuppressed,
  addSuppression,
  removeSuppression,
  listSuppressions,
  exportSuppressionsCsv,
};
