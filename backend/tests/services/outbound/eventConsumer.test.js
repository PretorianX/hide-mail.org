process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.OUTBOUND_KEY_ENCRYPTION_SECRET = 'test-secret-for-outbound-domain-keys';

const redisService = require('../../../services/redisService');
const messageStore = require('../../../services/outbound/messageStore');
const suppressionService = require('../../../services/outbound/suppressionService');
const bounceClassifier = require('../../../services/outbound/bounceClassifier');
const eventConsumer = require('../../../services/outbound/eventConsumer');
const metricsStore = require('../../../services/outbound/outboundMetricsStore');

const STREAM = 'outbound:events';
const GROUP = 'backend-consumers';

const createFakeRedis = () => {
  const entries = [];
  let idSeq = 1;
  const groups = new Set();
  const pending = new Map();

  return {
    async xadd(_stream, _id, ...fields) {
      const id = `${idSeq}-0`;
      idSeq += 1;
      const obj = {};
      for (let i = 0; i < fields.length; i += 2) {
        obj[fields[i]] = fields[i + 1];
      }
      entries.push([id, obj]);
      return id;
    },
    async xgroup(cmd, stream, group) {
      if (cmd === 'CREATE') {
        const key = `${stream}:${group}`;
        if (groups.has(key)) {
          const err = new Error('BUSYGROUP Consumer Group name already exists');
          err.message = 'BUSYGROUP Consumer Group name already exists';
          throw err;
        }
        groups.add(key);
      }
    },
    async xreadgroup(_cmd, group, _consumer, _countLabel, _count, _blockLabel, _block, stream, _id) {
      const unread = entries.filter(([id]) => !pending.has(`${group}:${id}`));
      if (unread.length === 0) {
        return null;
      }
      const batch = unread.slice(0, 10);
      for (const [id] of batch) {
        pending.set(`${group}:${id}`, true);
      }
      return [[stream, batch.map(([id, fields]) => [id, Object.entries(fields).flat()])]];
    },
    async xack(_stream, group, id) {
      pending.delete(`${group}:${id}`);
      return 1;
    },
  };
};

describe('outbound eventConsumer', () => {
  beforeEach(() => {
    redisService.client.data = {};
  });

  it('updates a delivered event to status delivered', async () => {
    await messageStore.createMessage({
      id: 'm1',
      accountId: 'a1',
      domain: 'mail.example.com',
      recipient: 'to@example.org',
      reference: null,
    });
    const redis = createFakeRedis();
    await redis.xadd(STREAM, '*', 'type', 'delivered', 'messageId', 'm1', 'domain', 'mail.example.com', 'response', '250 OK', 'at', new Date().toISOString());

    const result = await eventConsumer.consumeOnce(redis, {
      messageStore,
      bounceClassifier,
      suppressionService,
    });
    expect(result.processed).toBe(1);
    await expect(messageStore.getMessage('m1')).resolves.toMatchObject({ status: 'delivered' });
  });

  it('adds suppression for 550 5.1.1 bounced events', async () => {
    await messageStore.createMessage({
      id: 'm2',
      accountId: 'a1',
      domain: 'mail.example.com',
      recipient: 'gone@example.org',
      reference: null,
    });
    const redis = createFakeRedis();
    await redis.xadd(
      STREAM,
      '*',
      'type',
      'bounced',
      'messageId',
      'm2',
      'domain',
      'mail.example.com',
      'response',
      '550 5.1.1 User unknown',
      'at',
      new Date().toISOString()
    );

    await eventConsumer.consumeOnce(redis, { messageStore, bounceClassifier, suppressionService });
    await expect(
      suppressionService.isSuppressed({ accountId: 'a1', email: 'gone@example.org' })
    ).resolves.toBe(true);
  });

  it('does not suppress 550 5.7.1 policy bounces', async () => {
    await messageStore.createMessage({
      id: 'm3',
      accountId: 'a1',
      domain: 'mail.example.com',
      recipient: 'policy@example.org',
      reference: null,
    });
    const redis = createFakeRedis();
    await redis.xadd(
      STREAM,
      '*',
      'type',
      'bounced',
      'messageId',
      'm3',
      'domain',
      'mail.example.com',
      'response',
      '550 5.7.1 Delivery not authorized',
      'at',
      new Date().toISOString()
    );

    await eventConsumer.consumeOnce(redis, { messageStore, bounceClassifier, suppressionService });
    await expect(messageStore.getMessage('m3')).resolves.toMatchObject({ status: 'bounced' });
    await expect(
      suppressionService.isSuppressed({ accountId: 'a1', email: 'policy@example.org' })
    ).resolves.toBe(false);
  });

  it('applying the same bounce twice leaves one suppression entry', async () => {
    await messageStore.createMessage({
      id: 'm4',
      accountId: 'a1',
      domain: 'mail.example.com',
      recipient: 'gone@example.org',
      reference: null,
    });

    const handler = eventConsumer.createHandler({ messageStore, bounceClassifier, suppressionService });
    const fields = {
      type: 'bounced',
      messageId: 'm4',
      domain: 'mail.example.com',
      response: '550 5.1.1 User unknown',
      at: new Date().toISOString(),
    };
    await handler(fields);
    await handler(fields);

    const list = await suppressionService.listSuppressions({ accountId: 'a1' });
    expect(list).toHaveLength(1);
  });

  it('acks and skips unknown messageIds without throwing', async () => {
    const redis = createFakeRedis();
    await redis.xadd(
      STREAM,
      '*',
      'type',
      'delivered',
      'messageId',
      'missing',
      'domain',
      'mail.example.com',
      'response',
      '250 OK',
      'at',
      new Date().toISOString()
    );

    await expect(
      eventConsumer.consumeOnce(redis, { messageStore, bounceClassifier, suppressionService })
    ).resolves.toEqual({ processed: 1 });
  });

  it('increments delivered once when the same delivered event is applied twice (Review Focus)', async () => {
    await messageStore.createMessage({
      id: 'm-del',
      accountId: 'a1',
      domain: 'mail.example.com',
      recipient: 'to@example.org',
      reference: null,
    });
    await metricsStore.incrAccepted('mail.example.com');

    const handler = eventConsumer.createHandler({
      messageStore,
      bounceClassifier,
      suppressionService,
      metricsStore,
    });
    const fields = {
      type: 'delivered',
      messageId: 'm-del',
      domain: 'mail.example.com',
      response: '250 OK',
      at: new Date().toISOString(),
      streamId: '1-0',
    };
    await handler(fields);
    await handler(fields);

    const counters = await metricsStore.readCounters('mail.example.com');
    expect(counters.delivered).toBe(1);
    expect(counters.queued).toBe(0);
  });

  it('increments deferred once per distinct streamId', async () => {
    await messageStore.createMessage({
      id: 'm-def',
      accountId: 'a1',
      domain: 'mail.example.com',
      recipient: 'to@example.org',
      reference: null,
    });

    const handler = eventConsumer.createHandler({
      messageStore,
      bounceClassifier,
      suppressionService,
      metricsStore,
    });
    await handler({
      type: 'deferred',
      messageId: 'm-def',
      domain: 'mail.example.com',
      response: '450 try later',
      streamId: 's-1',
    });
    await handler({
      type: 'deferred',
      messageId: 'm-def',
      domain: 'mail.example.com',
      response: '450 try later',
      streamId: 's-1',
    });
    await handler({
      type: 'deferred',
      messageId: 'm-def',
      domain: 'mail.example.com',
      response: '450 try later',
      streamId: 's-2',
    });

    const counters = await metricsStore.readCounters('mail.example.com');
    expect(counters.deferred).toBe(2);
  });
});
