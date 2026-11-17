/**
 * Outbound message persistence and idempotency replay store.
 *
 * Redis keys:
 *   outbound:message:<id>                              JSON message record (no body; subject +
 *                                                      send metadata kept for Activity)
 *   outbound:idempotency:<accountId>:<idempotencyKey>  JSON { statusCode, body } of first response
 *   outbound:account:<accountId>:messages              ZSET score=createdAt, member=messageId
 */

const redisService = require('../redisService');
const config = require('../../config/config');

const MESSAGE_PREFIX = 'outbound:message:';
const idempotencyKey = (accountId, key) => `outbound:idempotency:${accountId}:${key}`;
const accountMessagesKey = (accountId) => `outbound:account:${accountId}:messages`;

const messageTtlSeconds = () => Math.max(1, Math.ceil(config.outbound.messageRetentionDays * 86400));

const createMessage = async ({
  id,
  accountId,
  domain,
  recipient,
  reference,
  subject = null,
  from = null,
  envelopeFrom = null,
  clientIp = null,
  sendKeyName = null,
}) => {
  const createdAt = Date.now();
  const record = {
    id,
    accountId,
    domain,
    recipient,
    reference: reference ?? null,
    subject: subject ?? null,
    from: from ?? null,
    envelopeFrom: envelopeFrom ?? null,
    clientIp: clientIp ?? null,
    sendKeyName: sendKeyName ?? null,
    status: 'queued',
    createdAt,
    lastEventAt: null,
    lastResponse: null,
  };
  const ttlSeconds = messageTtlSeconds();
  await redisService.client.setex(`${MESSAGE_PREFIX}${id}`, ttlSeconds, JSON.stringify(record));
  await redisService.client.zadd(accountMessagesKey(accountId), createdAt, id);
  await redisService.client.expire(accountMessagesKey(accountId), ttlSeconds);
};

const getMessage = async (id) => {
  const raw = await redisService.client.get(`${MESSAGE_PREFIX}${id}`);
  return raw ? JSON.parse(raw) : null;
};

const updateStatus = async ({ id, status, response }) => {
  const existing = await getMessage(id);
  if (!existing) {
    throw new Error(`Cannot update status for unknown message: ${id}`);
  }

  const updated = {
    ...existing,
    status,
    lastEventAt: Date.now(),
    lastResponse: response ?? null,
  };

  const ttl = await redisService.client.ttl(`${MESSAGE_PREFIX}${id}`);
  if (ttl > 0) {
    await redisService.client.setex(`${MESSAGE_PREFIX}${id}`, ttl, JSON.stringify(updated));
  } else {
    await redisService.client.setex(`${MESSAGE_PREFIX}${id}`, messageTtlSeconds(), JSON.stringify(updated));
  }
};

const listRecentMessages = async ({ accountId, limit = 50 }) => {
  const capped = Math.min(Math.max(1, Number(limit) || 50), 500);
  const ids = await redisService.client.zrevrange(accountMessagesKey(accountId), 0, capped - 1);
  const messages = [];
  for (const id of ids) {
    const message = await getMessage(id);
    if (message) {
      messages.push(message);
    }
  }
  return messages;
};

const getReplay = async ({ accountId, idempotencyKey: key }) => {
  const raw = await redisService.client.get(idempotencyKey(accountId, key));
  return raw ? JSON.parse(raw) : null;
};

const storeReplay = async ({ accountId, idempotencyKey: key, statusCode, body }) => {
  const ttlSeconds = Math.max(1, Math.ceil(config.outbound.idempotencyTtlSeconds));
  await redisService.client.setex(
    idempotencyKey(accountId, key),
    ttlSeconds,
    JSON.stringify({ statusCode, body })
  );
};

module.exports = {
  createMessage,
  getMessage,
  updateStatus,
  listRecentMessages,
  getReplay,
  storeReplay,
  accountMessagesKey,
};
