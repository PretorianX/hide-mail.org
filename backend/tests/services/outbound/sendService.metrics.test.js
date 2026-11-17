process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.OUTBOUND_KEY_ENCRYPTION_SECRET = 'test-secret-for-outbound-domain-keys';

const redisService = require('../../../services/redisService');
const sendService = require('../../../services/outbound/sendService');
const store = require('../../../services/outbound/outboundMetricsStore');

const verifiedMeta = {
  accountId: 'acct-1',
  state: 'verified',
  suspended: false,
  dailyLimit: 1000,
};

const basePayload = () => ({
  accountId: 'acct-1',
  from: { email: 'billing@mail.example.com', name: 'Example' },
  to: 'client@example.org',
  subject: 'Invoice',
  text: 'hello',
  html: '<p>hello</p>',
  reference: 'ref-1',
  idempotencyKey: null,
});

const okDeps = (overrides = {}) => ({
  domainService: {
    getDomainMeta: jest.fn().mockResolvedValue(verifiedMeta),
  },
  accountRateLimiter: {
    checkAndIncrement: jest.fn().mockResolvedValue({ allowed: true, limit: 600, retryAfterSeconds: 60 }),
  },
  capService: {
    checkAndIncrement: jest.fn().mockResolvedValue({ allowed: true, remaining: 999, resetAt: Date.now() }),
    releaseIncrement: jest.fn(),
  },
  suppressionService: { isSuppressed: jest.fn().mockResolvedValue(false) },
  mimeTransport: { sendMail: jest.fn().mockResolvedValue({}) },
  messageStore: {
    createMessage: jest.fn().mockResolvedValue(undefined),
    getReplay: jest.fn().mockResolvedValue(null),
    storeReplay: jest.fn(),
  },
  metricsStore: store,
  ...overrides,
});

describe('outbound sendService metrics instrumentation', () => {
  beforeEach(() => {
    redisService.client.data = {};
  });

  it('increments accepted and queued on successful send', async () => {
    await sendService.sendMessage(basePayload(), okDeps());
    const counters = await store.readCounters('mail.example.com');
    expect(counters.accepted).toBe(1);
    expect(counters.queued).toBe(1);
  });

  it('maps rejection codes to rejected reasons', async () => {
    const cases = [
      {
        code: 'RATE_LIMITED',
        deps: {
          accountRateLimiter: {
            checkAndIncrement: jest.fn().mockResolvedValue({
              allowed: false,
              limit: 1,
              retryAfterSeconds: 10,
            }),
          },
        },
        reason: 'rate_limit',
        domain: 'mail.example.com',
      },
      {
        code: 'DOMAIN_NOT_VERIFIED',
        deps: {
          domainService: {
            getDomainMeta: jest.fn().mockResolvedValue({ ...verifiedMeta, state: 'pending' }),
          },
        },
        reason: 'domain_not_verified',
        domain: 'mail.example.com',
      },
      {
        code: 'DOMAIN_SUSPENDED',
        deps: {
          domainService: {
            getDomainMeta: jest.fn().mockResolvedValue({ ...verifiedMeta, suspended: true }),
          },
        },
        reason: 'domain_suspended',
        domain: 'mail.example.com',
      },
      {
        code: 'INVALID_RECIPIENT',
        deps: {},
        payload: { ...basePayload(), to: 'not-an-email' },
        reason: 'invalid_recipient',
        domain: 'mail.example.com',
      },
      {
        code: 'RECIPIENT_SUPPRESSED',
        deps: {
          suppressionService: { isSuppressed: jest.fn().mockResolvedValue(true) },
        },
        reason: 'suppressed',
        domain: 'mail.example.com',
      },
      {
        code: 'DAILY_LIMIT_REACHED',
        deps: {
          capService: {
            checkAndIncrement: jest
              .fn()
              .mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() }),
            releaseIncrement: jest.fn(),
          },
        },
        reason: 'daily_limit',
        domain: 'mail.example.com',
      },
    ];

    for (const item of cases) {
      redisService.client.data = {};
      await expect(
        sendService.sendMessage(item.payload || basePayload(), okDeps(item.deps))
      ).rejects.toMatchObject({ code: item.code });
      const counters = await store.readCounters(item.domain);
      expect(counters.rejected[item.reason]).toBe(1);
      expect(counters.accepted).toBe(0);
    }
  });

  it('uses _unknown domain when rate limited without a From domain', async () => {
    await expect(
      sendService.sendMessage(
        { ...basePayload(), from: { email: 'not-an-address' } },
        okDeps({
          accountRateLimiter: {
            checkAndIncrement: jest.fn().mockResolvedValue({
              allowed: false,
              limit: 1,
              retryAfterSeconds: 5,
            }),
          },
        })
      )
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });

    const counters = await store.readCounters('_unknown');
    expect(counters.rejected.rate_limit).toBe(1);
  });

  it('does not increment accepted or rejected on ZoneMTA 503', async () => {
    await expect(
      sendService.sendMessage(
        basePayload(),
        okDeps({
          mimeTransport: {
            sendMail: jest.fn().mockRejectedValue(new Error('connection refused')),
          },
        })
      )
    ).rejects.toMatchObject({ code: 'ZONEMTA_UNAVAILABLE' });

    const counters = await store.readCounters('mail.example.com');
    expect(counters.accepted).toBe(0);
    expect(Object.values(counters.rejected).every((v) => v === 0)).toBe(true);
  });
});
