/**
 * Poll postfix-http-api /v1/events and XADD into outbound:events for eventConsumer.
 */

const redisService = require('../redisService');
const logger = require('../../utils/logger');
const config = require('../../config/config');
const defaultMessageStore = require('./messageStore');
const { createPostfixApiClient } = require('./postfixApiClient');

const STREAM = 'outbound:events';
const CURSOR_KEY = 'outbound:postfix-api:events-cursor';
const EMPTY_BACKOFF_MS = 1500;
const WIPE_PROBE_LIMIT = 1000;
const WIPE_WARN_COOLDOWN_MS = 5 * 60 * 1000;

let lastWipeWarnAt = 0;

const maxEventId = (events) => {
  let max = 0;
  for (const event of events) {
    const id = Number(event?.id);
    if (Number.isFinite(id) && id > max) {
      max = id;
    }
  }
  return max;
};

/**
 * Empty after=cursor is normal when caught up. Only warn when Redis cursor is
 * strictly ahead of the highest event id still in postfix-api (SQLite wipe/reset).
 */
const maybeWarnCursorAheadOfFeed = async ({ apiClient, previousCursor }) => {
  if (previousCursor <= 0) {
    return;
  }
  const now = Date.now();
  if (now - lastWipeWarnAt < WIPE_WARN_COOLDOWN_MS) {
    return;
  }

  const probe = await apiClient.getEvents({ after: 0, limit: WIPE_PROBE_LIMIT });
  const feed = Array.isArray(probe?.events) ? probe.events : Array.isArray(probe) ? probe : [];
  const feedMax = maxEventId(feed);

  if (feedMax >= previousCursor) {
    return; // caught up / idle
  }

  lastWipeWarnAt = now;
  logger.warn(
    `postfix-api event bridge: cursor=${previousCursor} ahead of feed max id=${feedMax}; ` +
      `if SQLite was wiped, clear Redis key ${CURSOR_KEY}`
  );
};

const mapPostfixApiEventType = (eventName) => {
  switch (String(eventName || '').toLowerCase()) {
    case 'delivered':
      return 'delivered';
    case 'deferred':
      return 'deferred';
    case 'bounced':
      return 'bounced';
    case 'expired':
      return 'bounced';
    default:
      return null;
  }
};

const buildResponse = (event) => {
  if (event.response) {
    return String(event.response);
  }
  if (event.dsn) {
    return String(event.dsn);
  }
  if (event.event === 'expired') {
    return 'expired';
  }
  return String(event.event || '');
};

const processEventBatch = async ({
  events,
  redisClient,
  messageStore = defaultMessageStore,
  previousCursor = 0,
} = {}) => {
  const list = Array.isArray(events) ? events : [];
  let written = 0;
  let skipped = 0;
  let ignored = 0;
  let cursor = previousCursor;

  for (const event of list) {
    const eventId = Number(event.id);
    if (Number.isFinite(eventId) && eventId > cursor) {
      cursor = eventId;
    }

    const type = mapPostfixApiEventType(event.event);
    if (!type) {
      ignored += 1;
      continue;
    }

    const messageId = await messageStore.getMessageIdByPostfixQueueId(event.queue_id);
    if (!messageId) {
      skipped += 1;
      continue;
    }

    const message = await messageStore.getMessage(messageId);
    if (!message) {
      skipped += 1;
      continue;
    }

    const at = event.time || new Date().toISOString();
    await redisClient.xadd(
      STREAM,
      '*',
      'type',
      type,
      'messageId',
      messageId,
      'domain',
      message.domain || '',
      'response',
      buildResponse(event),
      'at',
      at,
      'streamId',
      `postfix-api:${event.id}`
    );
    written += 1;
  }

  if (list.length > 0 && cursor !== previousCursor) {
    await redisClient.set(CURSOR_KEY, String(cursor));
  }

  return { written, skipped, ignored, cursor };
};

const readCursor = async (redisClient) => {
  const raw = await redisClient.get(CURSOR_KEY);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const pollOnce = async ({
  apiClient,
  redisClient = redisService.client,
  messageStore = defaultMessageStore,
  limit = 100,
} = {}) => {
  const previousCursor = await readCursor(redisClient);
  const payload = await apiClient.getEvents({ after: previousCursor, limit });
  const events = Array.isArray(payload?.events) ? payload.events : Array.isArray(payload) ? payload : [];

  if (events.length === 0 && previousCursor > 0) {
    await maybeWarnCursorAheadOfFeed({ apiClient, previousCursor });
  }

  return processEventBatch({
    events,
    redisClient,
    messageStore,
    previousCursor,
  });
};

const sleep = (ms) =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  });

const start = ({
  apiClient,
  redisClient = redisService.client,
  messageStore = defaultMessageStore,
  backoffMs = EMPTY_BACKOFF_MS,
} = {}) => {
  const baseUrl = config.outbound.postfixApi?.baseUrl;
  const token = config.outbound.postfixApi?.token;
  const client =
    apiClient ||
    (baseUrl && token
      ? createPostfixApiClient({ baseUrl, token })
      : null);

  if (!client) {
    logger.error(
      'postfix-api event bridge disabled: set POSTFIX_API_BASE_URL and POSTFIX_API_TOKEN'
    );
    return () => {};
  }

  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      const { written } = await pollOnce({ apiClient: client, redisClient, messageStore });
      if (written === 0) {
        await sleep(backoffMs);
      }
    } catch (error) {
      logger.error(`postfix-api event bridge poll failed: ${error.message}`, error);
      await sleep(backoffMs);
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
  STREAM,
  CURSOR_KEY,
  mapPostfixApiEventType,
  processEventBatch,
  pollOnce,
  start,
  // test helpers
  _resetWipeWarnCooldown: () => {
    lastWipeWarnAt = 0;
  },
};
