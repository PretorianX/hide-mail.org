process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.OUTBOUND_RETURN_PATH_TARGET = 'rp.hide-mail.org';
process.env.OUTBOUND_KEY_ENCRYPTION_SECRET = 'test-secret-for-outbound-domain-keys';

const redisService = require('../../../services/redisService');
const messageStore = require('../../../services/outbound/messageStore');
const suppressionService = require('../../../services/outbound/suppressionService');
const bounceClassifier = require('../../../services/outbound/bounceClassifier');
const metricsStore = require('../../../services/outbound/outboundMetricsStore');
const eventConsumer = require('../../../services/outbound/eventConsumer');
const { buildBounceEnvelopeFrom } = require('../../../services/outbound/bounceEnvelope');
const bounceMailbackService = require('../../../services/outbound/bounceMailbackService');

const hardDeliveryStatus = [
  'Reporting-MTA: dns; mx.example.com',
  '',
  'Final-Recipient: rfc822; gone@example.org',
  'Action: failed',
  'Status: 5.1.1',
  'Remote-MTA: dns; mx.example.net',
  'Diagnostic-Code: smtp; 550 5.1.1 User unknown',
  '',
].join('\r\n');

const mimeBounce = (statusPart) => {
  const boundary = 'bounce-boundary-e2e';
  return [
    'From: Mail Delivery Subsystem <mailer-daemon@mx.example.com>',
    'To: b-m-late@hm-bounce.mail.example.com',
    'Subject: Undelivered Mail Returned to Sender',
    'MIME-Version: 1.0',
    `Content-Type: multipart/report; report-type=delivery-status; boundary=${boundary}`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Delivery failed.',
    '',
    `--${boundary}`,
    'Content-Type: message/delivery-status',
    '',
    statusPart,
    `--${boundary}--`,
    '',
  ].join('\r\n');
};

const createCapturingRedis = () => {
  const events = [];
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
  };
};

describe('bounce mailback E2E (Review Focus)', () => {
  beforeEach(() => {
    redisService.client.data = {};
  });

  it('late hard DSN after delivered updates status, metrics, and suppression once', async () => {
    await messageStore.createMessage({
      id: 'm-late',
      accountId: 'a1',
      domain: 'mail.example.com',
      recipient: 'gone@example.org',
      reference: null,
    });
    await metricsStore.incrAccepted('mail.example.com');
    await metricsStore.incrDelivered('mail.example.com', 'm-late');
    await messageStore.updateStatus({ id: 'm-late', status: 'delivered', response: '250 OK' });

    const redis = createCapturingRedis();
    const handler = eventConsumer.createHandler({
      messageStore,
      bounceClassifier,
      suppressionService,
      metricsStore,
    });

    const signedRecipient = buildBounceEnvelopeFrom({
      messageId: 'm-late',
      accountId: 'a1',
      domain: 'mail.example.com',
      recipient: 'gone@example.org',
    });

    const applyOnce = async () => {
      const result = await bounceMailbackService.processBounceMailback({
        recipient: signedRecipient,
        rawBody: mimeBounce(hardDeliveryStatus),
        redisClient: redis,
      });
      expect(result).toMatchObject({ handled: true, eventType: 'bounced', messageId: 'm-late' });
      const last = redis.events[redis.events.length - 1];
      await handler({ ...last.fields, streamId: `${redis.events.length}-0` });
    };

    await applyOnce();
    await applyOnce();

    await expect(messageStore.getMessage('m-late')).resolves.toMatchObject({ status: 'bounced' });
    await expect(
      suppressionService.isSuppressed({ accountId: 'a1', email: 'gone@example.org' })
    ).resolves.toBe(true);

    const counters = await metricsStore.readCounters('mail.example.com');
    expect(counters.delivered).toBe(0);
    expect(counters.bounced.unknown_recipient).toBe(1);
    expect(counters.queued).toBe(0);

    const list = await suppressionService.listSuppressions({ accountId: 'a1' });
    expect(list).toHaveLength(1);

    // Terminal state: bounced cannot be overwritten by deferred or delivered
    await handler({ type: 'deferred', messageId: 'm-late', domain: 'mail.example.com', response: '450 later', streamId: '99-0' });
    await handler({ type: 'delivered', messageId: 'm-late', domain: 'mail.example.com', response: '250 OK', streamId: '100-0' });
    await expect(messageStore.getMessage('m-late')).resolves.toMatchObject({ status: 'bounced' });
  });

  it('prevents downgrading delivered to deferred (#230)', async () => {
    await messageStore.createMessage({
      id: 'm-deliv',
      accountId: 'a1',
      domain: 'mail.example.com',
      recipient: 'ok@example.org',
      reference: null,
    });
    await messageStore.updateStatus({ id: 'm-deliv', status: 'delivered', response: '250 OK' });

    const handler = eventConsumer.createHandler({
      messageStore,
      bounceClassifier,
      suppressionService,
      metricsStore,
    });

    await handler({ type: 'deferred', messageId: 'm-deliv', domain: 'mail.example.com', response: '450 delay', streamId: '1-0' });
    await expect(messageStore.getMessage('m-deliv')).resolves.toMatchObject({ status: 'delivered' });
  });
});
