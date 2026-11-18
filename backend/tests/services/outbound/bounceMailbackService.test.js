process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.OUTBOUND_RETURN_PATH_TARGET = 'rp.hide-mail.org';
process.env.OUTBOUND_KEY_ENCRYPTION_SECRET = 'test-secret-for-outbound-domain-keys';

const redisService = require('../../../services/redisService');
const messageStore = require('../../../services/outbound/messageStore');
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

const softDeliveryStatus = [
  'Reporting-MTA: dns; mx.example.com',
  '',
  'Final-Recipient: rfc822; busy@example.org',
  'Action: delayed',
  'Status: 4.2.1',
  'Remote-MTA: dns; mx.example.net',
  'Diagnostic-Code: smtp; 450 4.2.1 Mailbox busy',
  '',
].join('\r\n');

const mimeBounce = (statusPart) => {
  const boundary = 'bounce-boundary';
  return [
    'From: Mail Delivery Subsystem <mailer-daemon@mx.example.com>',
    'To: b-m1@hm-bounce.mail.example.com',
    'Subject: Undelivered Mail Returned to Sender',
    'MIME-Version: 1.0',
    `Content-Type: multipart/report; report-type=delivery-status; boundary=${boundary}`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Your message could not be delivered.',
    '',
    `--${boundary}`,
    'Content-Type: message/delivery-status',
    '',
    statusPart,
    `--${boundary}--`,
    '',
  ].join('\r\n');
};

const ordinaryMail = [
  'From: Ada <ada@example.com>',
  'To: you@example.com',
  'Subject: Hello',
  '',
  'Not a bounce.',
  '',
].join('\r\n');

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

describe('bounceMailbackService', () => {
  beforeEach(() => {
    redisService.client.data = {};
  });

  it('XADDs a bounced event for a hard 5.1.1 DSN', async () => {
    await messageStore.createMessage({
      id: 'm1',
      accountId: 'a1',
      domain: 'mail.example.com',
      recipient: 'gone@example.org',
      reference: null,
    });
    const recipient = buildBounceEnvelopeFrom({
      messageId: 'm1',
      accountId: 'a1',
      domain: 'mail.example.com',
      recipient: 'gone@example.org',
    });
    const redis = createCapturingRedis();
    const result = await bounceMailbackService.processBounceMailback({
      recipient,
      rawBody: mimeBounce(hardDeliveryStatus),
      redisClient: redis,
    });

    expect(result).toMatchObject({ handled: true, eventType: 'bounced', messageId: 'm1' });
    expect(redis.events).toHaveLength(1);
    expect(redis.events[0].stream).toBe('outbound:events');
    expect(redis.events[0].fields.type).toBe('bounced');
    expect(redis.events[0].fields.messageId).toBe('m1');
    expect(redis.events[0].fields.domain).toBe('mail.example.com');
    expect(redis.events[0].fields.response).toContain('5.1.1');
    expect(redis.events[0].fields.at).toBeTruthy();
  });

  it('XADDs a deferred event for a soft DSN', async () => {
    await messageStore.createMessage({
      id: 'm2',
      accountId: 'a1',
      domain: 'mail.example.com',
      recipient: 'busy@example.org',
      reference: null,
    });
    const recipient = buildBounceEnvelopeFrom({
      messageId: 'm2',
      accountId: 'a1',
      domain: 'mail.example.com',
      recipient: 'busy@example.org',
    });
    const redis = createCapturingRedis();
    const result = await bounceMailbackService.processBounceMailback({
      recipient,
      rawBody: mimeBounce(softDeliveryStatus),
      redisClient: redis,
    });

    expect(result).toMatchObject({ handled: true, eventType: 'deferred', messageId: 'm2' });
    expect(redis.events[0].fields.type).toBe('deferred');
  });

  it('handles unknown messageId without XADD', async () => {
    const redis = createCapturingRedis();
    const result = await bounceMailbackService.processBounceMailback({
      recipient: 'b-missing@hm-bounce.mail.example.com',
      rawBody: mimeBounce(hardDeliveryStatus),
      redisClient: redis,
    });
    expect(result).toEqual({ handled: true, reason: 'unknown_message' });
    expect(redis.events).toHaveLength(0);
  });

  it('handles non-DSN bodies without XADD', async () => {
    await messageStore.createMessage({
      id: 'm3',
      accountId: 'a1',
      domain: 'mail.example.com',
      recipient: 'x@example.org',
      reference: null,
    });
    const recipient = buildBounceEnvelopeFrom({
      messageId: 'm3',
      accountId: 'a1',
      domain: 'mail.example.com',
      recipient: 'x@example.org',
    });
    const redis = createCapturingRedis();
    const result = await bounceMailbackService.processBounceMailback({
      recipient,
      rawBody: ordinaryMail,
      redisClient: redis,
    });
    expect(result).toEqual({ handled: true, reason: 'not_a_dsn' });
    expect(redis.events).toHaveLength(0);
  });

  it('returns handled false for ordinary recipients', async () => {
    const redis = createCapturingRedis();
    const result = await bounceMailbackService.processBounceMailback({
      recipient: 'user@hide-mail.org',
      rawBody: mimeBounce(hardDeliveryStatus),
      redisClient: redis,
    });
    expect(result).toEqual({ handled: false, reason: 'not_bounce_recipient' });
    expect(redis.events).toHaveLength(0);
  });

  it('resolves domain from messageStore for return-path target recipient', async () => {
    await messageStore.createMessage({
      id: 'm4',
      accountId: 'a1',
      domain: 'mail.example.com',
      recipient: 'gone@example.org',
      reference: null,
    });
    const signedLocal = buildBounceEnvelopeFrom({
      messageId: 'm4',
      accountId: 'a1',
      domain: 'mail.example.com',
      recipient: 'gone@example.org',
    }).split('@')[0];
    const redis = createCapturingRedis();
    const result = await bounceMailbackService.processBounceMailback({
      recipient: `${signedLocal}@rp.hide-mail.org`,
      rawBody: mimeBounce(hardDeliveryStatus),
      redisClient: redis,
    });
    expect(result).toMatchObject({ handled: true, eventType: 'bounced', messageId: 'm4' });
    expect(redis.events[0].fields.domain).toBe('mail.example.com');
  });

  it('rejects a forged DSN without a valid HMAC before parsing (#230)', async () => {
    await messageStore.createMessage({
      id: 'm5',
      accountId: 'a1',
      domain: 'mail.example.com',
      recipient: 'gone@example.org',
      reference: null,
    });
    const redis = createCapturingRedis();

    const unsignedResult = await bounceMailbackService.processBounceMailback({
      recipient: 'b-m5@hm-bounce.mail.example.com',
      rawBody: mimeBounce(hardDeliveryStatus),
      redisClient: redis,
    });
    expect(unsignedResult).toEqual({ handled: true, reason: 'invalid_verp_signature' });

    const tamperedResult = await bounceMailbackService.processBounceMailback({
      recipient: 'b-m5.tampered00000000000000@hm-bounce.mail.example.com',
      rawBody: mimeBounce(hardDeliveryStatus),
      redisClient: redis,
    });
    expect(tamperedResult).toEqual({ handled: true, reason: 'invalid_verp_signature' });
    expect(redis.events).toHaveLength(0);
  });

  it('rejects a DSN whose Final-Recipient does not match the stored message recipient (#230)', async () => {
    await messageStore.createMessage({
      id: 'm6',
      accountId: 'a1',
      domain: 'mail.example.com',
      recipient: 'actual@example.org',
      reference: null,
    });
    const recipient = buildBounceEnvelopeFrom({
      messageId: 'm6',
      accountId: 'a1',
      domain: 'mail.example.com',
      recipient: 'actual@example.org',
    });
    const redis = createCapturingRedis();

    const result = await bounceMailbackService.processBounceMailback({
      recipient,
      rawBody: mimeBounce(hardDeliveryStatus), // Final-Recipient is gone@example.org
      redisClient: redis,
    });
    expect(result).toEqual({ handled: true, reason: 'recipient_mismatch' });
    expect(redis.events).toHaveLength(0);
  });

  it('rejects a DSN whose VERP domain does not match the stored message domain (#230)', async () => {
    await messageStore.createMessage({
      id: 'm7',
      accountId: 'a1',
      domain: 'mail.example.com',
      recipient: 'gone@example.org',
      reference: null,
    });
    const validLocal = buildBounceEnvelopeFrom({
      messageId: 'm7',
      accountId: 'a1',
      domain: 'mail.example.com',
      recipient: 'gone@example.org',
    }).split('@')[0];
    const redis = createCapturingRedis();

    const result = await bounceMailbackService.processBounceMailback({
      recipient: `${validLocal}@hm-bounce.spoofed.example.com`,
      rawBody: mimeBounce(hardDeliveryStatus),
      redisClient: redis,
    });
    expect(result).toEqual({ handled: true, reason: 'domain_mismatch' });
    expect(redis.events).toHaveLength(0);
  });
});
