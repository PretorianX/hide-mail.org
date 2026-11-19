process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.OUTBOUND_KEY_ENCRYPTION_SECRET = 'test-secret-for-outbound-domain-keys';

const redisService = require('../../../services/redisService');
const messageStore = require('../../../services/outbound/messageStore');
const logger = require('../../../utils/logger');
const config = require('../../../config/config');
const {
  mapPostfixApiEventType,
  processEventBatch,
  pollOnce,
  start,
  CURSOR_KEY,
  STREAM,
  _resetWipeWarnCooldown,
} = require('../../../services/outbound/postfixApiEventBridge');

const createCapturingRedis = () => {
  const events = [];
  const kv = {};
  return {
    events,
    async xadd(stream, _id, ...fields) {
      const obj = {};
      for (let i = 0; i < fields.length; i += 2) {
        obj[fields[i]] = fields[i + 1];
      }
      events.push({ stream, fields: obj });
      return `${events.length}-0`;
    },
    async get(key) {
      return kv[key] ?? null;
    },
    async set(key, value) {
      kv[key] = String(value);
      return 'OK';
    },
  };
};

describe('postfixApiEventBridge', () => {
  beforeEach(() => {
    redisService.client.data = {};
    _resetWipeWarnCooldown();
  });

  describe('mapPostfixApiEventType', () => {
    it('maps delivery statuses and ignores processed', () => {
      expect(mapPostfixApiEventType('delivered')).toBe('delivered');
      expect(mapPostfixApiEventType('deferred')).toBe('deferred');
      expect(mapPostfixApiEventType('bounced')).toBe('bounced');
      expect(mapPostfixApiEventType('expired')).toBe('bounced');
      expect(mapPostfixApiEventType('processed')).toBeNull();
      expect(mapPostfixApiEventType('unknown')).toBeNull();
    });
  });

  describe('processEventBatch', () => {
    it('XADDs mapped events for known queue ids and advances cursor', async () => {
      await messageStore.createMessage({
        id: 'm1',
        accountId: 'a1',
        domain: 'mail.example.com',
        recipient: 'to@example.org',
        reference: null,
        postfixQueueId: 'QID1',
      });

      const redis = createCapturingRedis();
      const events = [
        { id: 10, time: '2026-11-19T12:00:00Z', queue_id: 'QID1', event: 'processed' },
        {
          id: 11,
          time: '2026-11-19T12:00:01Z',
          queue_id: 'QID1',
          recipient: 'to@example.org',
          event: 'delivered',
          response: '250 2.0.0 Ok',
          dsn: '2.0.0',
        },
        {
          id: 12,
          time: '2026-11-19T12:00:02Z',
          queue_id: 'OTHER',
          event: 'deferred',
          response: '450 try later',
        },
      ];

      const result = await processEventBatch({
        events,
        redisClient: redis,
        messageStore,
      });

      expect(result).toMatchObject({ written: 1, skipped: 1, ignored: 1, cursor: 12 });
      expect(await redis.get(CURSOR_KEY)).toBe('12');
      expect(redis.events).toHaveLength(1);
      expect(redis.events[0]).toMatchObject({
        stream: STREAM,
        fields: {
          type: 'delivered',
          messageId: 'm1',
          domain: 'mail.example.com',
          response: '250 2.0.0 Ok',
          streamId: 'postfix-api:11',
        },
      });
    });

    it('maps expired to bounced with response', async () => {
      await messageStore.createMessage({
        id: 'm2',
        accountId: 'a1',
        domain: 'mail.example.com',
        recipient: 'to@example.org',
        reference: null,
        postfixQueueId: 'QID2',
      });

      const redis = createCapturingRedis();
      await processEventBatch({
        events: [
          {
            id: 20,
            time: '2026-11-19T12:00:00Z',
            queue_id: 'QID2',
            event: 'expired',
            response: 'force-expired',
          },
        ],
        redisClient: redis,
        messageStore,
      });

      expect(redis.events[0].fields.type).toBe('bounced');
      expect(redis.events[0].fields.response).toBe('force-expired');
    });

    it('leaves cursor unchanged on empty batch', async () => {
      const redis = createCapturingRedis();
      await redis.set(CURSOR_KEY, '5');
      const result = await processEventBatch({
        events: [],
        redisClient: redis,
        messageStore,
        previousCursor: 5,
      });
      expect(result.cursor).toBe(5);
      expect(await redis.get(CURSOR_KEY)).toBe('5');
      expect(redis.events).toHaveLength(0);
    });

    it('advances cursor for unknown queue ids without XADD', async () => {
      const redis = createCapturingRedis();
      const result = await processEventBatch({
        events: [
          {
            id: 30,
            time: '2026-11-19T12:00:00Z',
            queue_id: 'FOREIGN',
            event: 'bounced',
            response: '550 5.1.1',
          },
        ],
        redisClient: redis,
        messageStore,
        previousCursor: 0,
      });

      expect(result).toMatchObject({ written: 0, skipped: 1, ignored: 0, cursor: 30 });
      expect(await redis.get(CURSOR_KEY)).toBe('30');
      expect(redis.events).toHaveLength(0);
    });

    it('XADDs bounced and falls back to dsn when response is missing', async () => {
      await messageStore.createMessage({
        id: 'm-bounce',
        accountId: 'a1',
        domain: 'mail.example.com',
        recipient: 'gone@example.org',
        reference: null,
        postfixQueueId: 'QB1',
      });

      const redis = createCapturingRedis();
      await processEventBatch({
        events: [
          {
            id: 40,
            time: '2026-11-19T12:00:00Z',
            queue_id: 'QB1',
            event: 'bounced',
            dsn: '5.1.1',
          },
        ],
        redisClient: redis,
        messageStore,
      });

      expect(redis.events[0].fields).toMatchObject({
        type: 'bounced',
        messageId: 'm-bounce',
        response: '5.1.1',
        streamId: 'postfix-api:40',
      });
    });
  });

  describe('pollOnce (API integration)', () => {
    it('reads cursor, calls getEvents(after), XADDs mapped events, advances cursor', async () => {
      await messageStore.createMessage({
        id: 'm-poll',
        accountId: 'a1',
        domain: 'mail.example.com',
        recipient: 'to@example.org',
        reference: null,
        postfixQueueId: 'QPOLL',
      });

      const redis = createCapturingRedis();
      await redis.set(CURSOR_KEY, '50');

      const apiClient = {
        getEvents: jest.fn().mockResolvedValue({
          events: [
            {
              id: 51,
              time: '2026-11-19T13:00:00Z',
              queue_id: 'QPOLL',
              event: 'deferred',
              response: '450 try later',
              dsn: '4.4.1',
            },
            {
              id: 52,
              time: '2026-11-19T13:00:05Z',
              queue_id: 'QPOLL',
              event: 'delivered',
              response: '250 2.0.0 Ok',
            },
          ],
        }),
      };

      const result = await pollOnce({
        apiClient,
        redisClient: redis,
        messageStore,
      });

      expect(apiClient.getEvents).toHaveBeenCalledWith({ after: 50, limit: 100 });
      expect(result).toMatchObject({ written: 2, cursor: 52 });
      expect(await redis.get(CURSOR_KEY)).toBe('52');
      expect(redis.events.map((e) => e.fields.type)).toEqual(['deferred', 'delivered']);
      expect(redis.events[0].fields).toMatchObject({
        messageId: 'm-poll',
        streamId: 'postfix-api:51',
        response: '450 try later',
      });
    });

    it('does not advance cursor when getEvents throws', async () => {
      const redis = createCapturingRedis();
      await redis.set(CURSOR_KEY, '7');
      const apiClient = {
        getEvents: jest.fn().mockRejectedValue(Object.assign(new Error('postfix-api 503'), { status: 503 })),
      };

      await expect(
        pollOnce({ apiClient, redisClient: redis, messageStore })
      ).rejects.toMatchObject({ status: 503 });

      expect(await redis.get(CURSOR_KEY)).toBe('7');
      expect(redis.events).toHaveLength(0);
    });

    it('stays quiet on empty page when caught up (feed max id >= cursor)', async () => {
      const redis = createCapturingRedis();
      await redis.set(CURSOR_KEY, '2');
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
      const apiClient = {
        getEvents: jest
          .fn()
          .mockResolvedValueOnce({ events: [] }) // after=2 — idle
          .mockResolvedValueOnce({
            events: [
              { id: 1, event: 'processed', queue_id: 'a' },
              { id: 2, event: 'delivered', queue_id: 'a' },
            ],
          }), // after=0 probe
      };

      try {
        const result = await pollOnce({
          apiClient,
          redisClient: redis,
          messageStore,
        });
        expect(result.cursor).toBe(2);
        expect(await redis.get(CURSOR_KEY)).toBe('2');
        expect(warnSpy).not.toHaveBeenCalled();
        expect(apiClient.getEvents).toHaveBeenNthCalledWith(1, { after: 2, limit: 100 });
        expect(apiClient.getEvents).toHaveBeenNthCalledWith(2, { after: 0, limit: 1000 });
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('warns when cursor is ahead of feed max id (SQLite wipe / reset)', async () => {
      const redis = createCapturingRedis();
      await redis.set(CURSOR_KEY, '99');
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
      const apiClient = {
        getEvents: jest
          .fn()
          .mockResolvedValueOnce({ events: [] })
          .mockResolvedValueOnce({
            events: [
              { id: 1, event: 'processed', queue_id: 'a' },
              { id: 3, event: 'delivered', queue_id: 'b' },
            ],
          }),
      };

      try {
        await pollOnce({ apiClient, redisClient: redis, messageStore });
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('cursor=99 ahead of feed max id=3')
        );
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('accepts a bare events array payload from the API', async () => {
      await messageStore.createMessage({
        id: 'm-arr',
        accountId: 'a1',
        domain: 'mail.example.com',
        recipient: 'to@example.org',
        reference: null,
        postfixQueueId: 'QARR',
      });
      const redis = createCapturingRedis();
      const apiClient = {
        getEvents: jest.fn().mockResolvedValue([
          {
            id: 1,
            time: '2026-11-19T13:00:00Z',
            queue_id: 'QARR',
            event: 'delivered',
            response: '250 Ok',
          },
        ]),
      };

      const result = await pollOnce({ apiClient, redisClient: redis, messageStore });
      expect(result.written).toBe(1);
      expect(redis.events[0].fields.type).toBe('delivered');
    });
  });

  describe('start', () => {
    const flushMicrotasks = async () => {
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
    };

    it('disables and logs when no apiClient and token is missing', () => {
      const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
      const previous = { ...config.outbound.postfixApi };
      config.outbound.postfixApi.token = '';
      config.outbound.postfixApi.baseUrl = '';

      try {
        const stop = start({});
        expect(typeof stop).toBe('function');
        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining('postfix-api event bridge disabled')
        );
        stop();
      } finally {
        config.outbound.postfixApi.token = previous.token;
        config.outbound.postfixApi.baseUrl = previous.baseUrl;
        errorSpy.mockRestore();
      }
    });

    it('logs poll failures and leaves cursor unchanged', async () => {
      const redis = createCapturingRedis();
      await redis.set(CURSOR_KEY, '3');
      const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
      const apiClient = {
        getEvents: jest.fn().mockRejectedValue(new Error('postfix-api 503')),
      };

      const stop = start({
        apiClient,
        redisClient: redis,
        messageStore,
        backoffMs: 5,
      });

      try {
        await flushMicrotasks();
        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining('postfix-api event bridge poll failed'),
          expect.any(Error)
        );
        expect(await redis.get(CURSOR_KEY)).toBe('3');
        expect(redis.events).toHaveLength(0);
      } finally {
        stop();
        errorSpy.mockRestore();
        await flushMicrotasks();
      }
    });
  });
});
