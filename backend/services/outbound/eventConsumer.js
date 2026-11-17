/**
 * Idempotent consumer of ZoneMTA delivery events from Redis Stream outbound:events.
 *
 * Idempotency reasoning (no extra de-dup layer for message/suppression):
 * - messageStore.updateStatus is an unconditional overwrite (Task 8).
 * - suppressionService.addSuppression uses HSET of the same field/value (naturally idempotent).
 * Metrics use outboundMetricsStore terminal/streamId SET NX gates (M2).
 */

const redisService = require('../redisService');
const logger = require('../../utils/logger');
const defaultMessageStore = require('./messageStore');
const defaultBounceClassifier = require('./bounceClassifier');
const defaultSuppressionService = require('./suppressionService');
const defaultMetricsStore = require('./outboundMetricsStore');

const STREAM = 'outbound:events';
const GROUP = 'backend-consumers';
const CONSUMER = 'backend-1';
const EMPTY_BACKOFF_MS = 500;

const fieldsToObject = (flat) => {
  if (!Array.isArray(flat)) {
    return flat || {};
  }
  const obj = {};
  for (let i = 0; i < flat.length; i += 2) {
    obj[flat[i]] = flat[i + 1];
  }
  return obj;
};

const recordMetrics = async (metricsStore, bounceClassifier, fields) => {
  const { type, messageId, domain, response, streamId } = fields;
  if (!domain || !type) {
    return;
  }

  if (type === 'delivered') {
    await metricsStore.incrDelivered(domain, messageId);
    return;
  }
  if (type === 'deferred') {
    await metricsStore.incrDeferred(domain, streamId || messageId);
    return;
  }
  if (type === 'held') {
    await metricsStore.incrHeld(domain, streamId || messageId);
    return;
  }
  if (type === 'bounced') {
    const classification = bounceClassifier.classifyDeliveryResponse(response || '');
    await metricsStore.incrBounced(domain, messageId, classification.category || 'other');
  }
};

const createHandler = ({
  messageStore = defaultMessageStore,
  bounceClassifier = defaultBounceClassifier,
  suppressionService = defaultSuppressionService,
  metricsStore = defaultMetricsStore,
} = {}) => async (fields) => {
  const { type, messageId, response } = fields;
  if (!messageId || !type) {
    return;
  }

  const message = await messageStore.getMessage(messageId);
  if (!message) {
    return;
  }

  await messageStore.updateStatus({ id: messageId, status: type, response: response || '' });
  await recordMetrics(metricsStore, bounceClassifier, {
    ...fields,
    domain: fields.domain || message.domain,
  });

  if (type !== 'bounced') {
    return;
  }

  try {
    const classification = bounceClassifier.classifyDeliveryResponse(response || '');
    if (classification.shouldSuppress) {
      await suppressionService.addSuppression({
        accountId: message.accountId,
        email: message.recipient,
        reason: 'hard_bounce',
      });
    }
  } catch (error) {
    logger.error(`Outbound event consumer failed classifying/suppressing ${messageId}`, error);
  }
};

const ensureGroup = async (redisClient) => {
  try {
    await redisClient.xgroup('CREATE', STREAM, GROUP, '$', 'MKSTREAM');
  } catch (error) {
    if (!String(error.message || error).includes('BUSYGROUP')) {
      throw error;
    }
  }
};

const consumeOnce = async (
  redisClient,
  {
    messageStore = defaultMessageStore,
    bounceClassifier = defaultBounceClassifier,
    suppressionService = defaultSuppressionService,
    metricsStore = defaultMetricsStore,
  } = {}
) => {
  await ensureGroup(redisClient);
  const handler = createHandler({
    messageStore,
    bounceClassifier,
    suppressionService,
    metricsStore,
  });

  const result = await redisClient.xreadgroup(
    'GROUP',
    GROUP,
    CONSUMER,
    'COUNT',
    10,
    'BLOCK',
    1,
    'STREAMS',
    STREAM,
    '>'
  );

  if (!result) {
    return { processed: 0 };
  }

  let processed = 0;
  for (const [, entries] of result) {
    for (const [id, flatFields] of entries) {
      const fields = fieldsToObject(flatFields);
      fields.streamId = id;
      try {
        await handler(fields);
      } catch (error) {
        logger.error(`Outbound event consumer failed on ${id}`, error);
      }
      await redisClient.xack(STREAM, GROUP, id);
      processed += 1;
    }
  }

  return { processed };
};

const sleep = (ms) =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  });

const start = () => {
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      const { processed } = await consumeOnce(redisService.client);
      if (processed === 0) {
        await sleep(EMPTY_BACKOFF_MS);
      }
    } catch (error) {
      logger.error('Outbound event consumer tick failed', error);
      await sleep(EMPTY_BACKOFF_MS);
    }
    if (!stopped) {
      setImmediate(tick);
    }
  };

  setImmediate(tick);
  return () => {
    stopped = true;
  };
};

module.exports = {
  consumeOnce,
  start,
  createHandler,
};
