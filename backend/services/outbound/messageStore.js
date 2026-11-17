/**
 * Outbound message persistence and idempotency replay store.
 *
 * Redis keys:
 *   outbound:message:<id>                              JSON message record (no body/subject)
 *   outbound:idempotency:<accountId>:<idempotencyKey>  JSON { statusCode, body } of first response
 */

const redisService = require('../redisService');
const config = require('../../config/config');

const MESSAGE_PREFIX = 'outbound:message:';
const idempotencyKey = (accountId, key) => `outbound:idempotency:${accountId}:${key}`;

const createMessage = async ({ id, accountId, domain, recipient, reference }) => {
  const createdAt = Date.now();
  const record = {
    id,
    accountId,
    domain,
    recipient,
    reference: reference ?? null,
    status: 'queued',
    createdAt,
    lastEventAt: null,
    lastResponse: null,
  };
  const ttlSeconds = Math.max(1, Math.ceil(config.outbound.messageRetentionDays * 86400));
  await redisService.client.setex(`${MESSAGE_PREFIX}${id}`, ttlSeconds, JSON.stringify(record));
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
    const ttlSeconds = Math.max(1, Math.ceil(config.outbound.messageRetentionDays * 86400));
    await redisService.client.setex(`${MESSAGE_PREFIX}${id}`, ttlSeconds, JSON.stringify(updated));
  }
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
  getReplay,
  storeReplay,
};
