process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.OUTBOUND_KEY_ENCRYPTION_SECRET = 'test-secret-for-outbound-domain-keys';

const redisService = require('../../../services/redisService');
const store = require('../../../services/outbound/outboundMetricsStore');

describe('outboundMetricsStore', () => {
  beforeEach(() => {
    redisService.client.data = {};
  });

  it('incrAccepted bumps accepted and queued', async () => {
    await store.incrAccepted('mail.example.com');
    const counters = await store.readCounters('mail.example.com');
    expect(counters.accepted).toBe(1);
    expect(counters.queued).toBe(1);
  });

  it('incrDelivered decrements queued and is idempotent per messageId', async () => {
    await store.incrAccepted('mail.example.com');
    const first = await store.incrDelivered('mail.example.com', 'msg-1');
    const second = await store.incrDelivered('mail.example.com', 'msg-1');
    expect(first).toBe(true);
    expect(second).toBe(false);
    const counters = await store.readCounters('mail.example.com');
    expect(counters.delivered).toBe(1);
    expect(counters.queued).toBe(0);
  });

  it('incrBounced is idempotent per messageId and tracks category', async () => {
    await store.incrAccepted('mail.example.com');
    expect(await store.incrBounced('mail.example.com', 'msg-2', 'unknown_recipient')).toBe(true);
    expect(await store.incrBounced('mail.example.com', 'msg-2', 'unknown_recipient')).toBe(false);
    const counters = await store.readCounters('mail.example.com');
    expect(counters.bounced.unknown_recipient).toBe(1);
    expect(counters.queued).toBe(0);
  });

  it('incrDeferred is idempotent per streamId', async () => {
    expect(await store.incrDeferred('mail.example.com', 'stream-1')).toBe(true);
    expect(await store.incrDeferred('mail.example.com', 'stream-1')).toBe(false);
    expect(await store.incrDeferred('mail.example.com', 'stream-2')).toBe(true);
    const counters = await store.readCounters('mail.example.com');
    expect(counters.deferred).toBe(2);
  });

  it('incrHeld is idempotent per streamId', async () => {
    expect(await store.incrHeld('mail.example.com', 'h-1')).toBe(true);
    expect(await store.incrHeld('mail.example.com', 'h-1')).toBe(false);
    const counters = await store.readCounters('mail.example.com');
    expect(counters.held).toBe(1);
  });

  it('incrRejected tracks each allowed reason', async () => {
    const reasons = [
      'invalid_recipient',
      'suppressed',
      'daily_limit',
      'rate_limit',
      'domain_not_verified',
      'domain_suspended',
    ];
    for (const reason of reasons) {
      await store.incrRejected('mail.example.com', reason);
    }
    const counters = await store.readCounters('mail.example.com');
    for (const reason of reasons) {
      expect(counters.rejected[reason]).toBe(1);
    }
  });

  it('incrDnsOutcome tracks pass/fail/no_answer', async () => {
    await store.incrDnsOutcome('mail.example.com', 'pass');
    await store.incrDnsOutcome('mail.example.com', 'no_answer');
    await store.incrDnsOutcome('mail.example.com', 'fail');
    expect(await store.readDnsOutcome('mail.example.com', 'pass')).toBe(1);
    expect(await store.readDnsOutcome('mail.example.com', 'no_answer')).toBe(1);
    expect(await store.readDnsOutcome('mail.example.com', 'fail')).toBe(1);
  });

  it('queued never goes below zero', async () => {
    await store.incrDelivered('mail.example.com', 'orphan');
    const counters = await store.readCounters('mail.example.com');
    expect(counters.queued).toBe(0);
  });
});
