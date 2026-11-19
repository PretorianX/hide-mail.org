process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.OUTBOUND_KEY_ENCRYPTION_SECRET = 'test-secret-for-outbound-domain-keys';

const redisService = require('../../../services/redisService');
const messageStore = require('../../../services/outbound/messageStore');
const logger = require('../../../utils/logger');
const {
  mapPostfixApiEventType,
  processEventBatch,
  pollOnce,
  CURSOR_KEY,
  STREAM,
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

    it('warns when empty page and cursor is ahead (possible SQLite wipe)', async () => {
      const redis = createCapturingRedis();
      await redis.set(CURSOR_KEY, '99');
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
      const apiClient = {
        getEvents: jest.fn().mockResolvedValue({ events: [] }),
      };

      try {
        const result = await pollOnce({
          apiClient,
          redisClient: redis,
          messageStore,
        });
        expect(result.cursor).toBe(99);
        expect(await redis.get(CURSOR_KEY)).toBe('99');
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('empty page with cursor=99')
        );
      } finally {
        warnSpy.mockRestore();
      }
    });
  });
});
