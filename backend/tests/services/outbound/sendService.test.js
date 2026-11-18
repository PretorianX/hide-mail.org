process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.OUTBOUND_KEY_ENCRYPTION_SECRET = 'test-secret-for-outbound-domain-keys';

const crypto = require('crypto');
const redisService = require('../../../services/redisService');
const sendService = require('../../../services/outbound/sendService');
const capService = require('../../../services/outbound/capService');
const messageStore = require('../../../services/outbound/messageStore');
const keyCrypto = require('../../../services/outbound/keyCrypto');

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

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const testPrivateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });

const verifiedMeta = {
  accountId: 'acct-1',
  state: 'verified',
  suspended: false,
  dailyLimit: 1000,
  selector: 'hmtest',
  privateKeyEnc: keyCrypto.encrypt(
    testPrivateKeyPem,
    process.env.OUTBOUND_KEY_ENCRYPTION_SECRET
  ),
};

describe('outbound sendService.sendMessage', () => {
  beforeEach(() => {
    redisService.client.data = {};
  });

  it('rate limited before anything else', async () => {
    const domainService = { getDomainMeta: jest.fn() };
    const accountRateLimiter = {
      checkAndIncrement: jest.fn().mockResolvedValue({
        allowed: false,
        limit: 600,
        retryAfterSeconds: 30,
      }),
    };

    await expect(
      sendService.sendMessage(basePayload(), {
        domainService,
        accountRateLimiter,
        suppressionService: { isSuppressed: jest.fn() },
        mimeTransport: { sendMail: jest.fn() },
      })
    ).rejects.toMatchObject({ code: 'RATE_LIMITED', retryAfterSeconds: 30 });

    expect(domainService.getDomainMeta).not.toHaveBeenCalled();
  });

  it('403 DOMAIN_NOT_VERIFIED for a pending domain', async () => {
    const domainService = {
      getDomainMeta: jest.fn().mockResolvedValue({ ...verifiedMeta, state: 'pending' }),
    };
    const accountRateLimiter = {
      checkAndIncrement: jest.fn().mockResolvedValue({ allowed: true, limit: 600, retryAfterSeconds: 60 }),
    };
    const cap = { checkAndIncrement: jest.fn(), releaseIncrement: jest.fn() };
    const suppressionService = { isSuppressed: jest.fn() };

    await expect(
      sendService.sendMessage(basePayload(), {
        domainService,
        accountRateLimiter,
        capService: cap,
        suppressionService,
        mimeTransport: { sendMail: jest.fn() },
      })
    ).rejects.toMatchObject({ code: 'DOMAIN_NOT_VERIFIED' });

    expect(suppressionService.isSuppressed).not.toHaveBeenCalled();
    expect(cap.checkAndIncrement).not.toHaveBeenCalled();
  });

  it('403 DOMAIN_SUSPENDED takes priority over daily cap', async () => {
    const domainService = {
      getDomainMeta: jest.fn().mockResolvedValue({ ...verifiedMeta, suspended: true }),
    };
    const accountRateLimiter = {
      checkAndIncrement: jest.fn().mockResolvedValue({ allowed: true, limit: 600, retryAfterSeconds: 60 }),
    };
    const cap = { checkAndIncrement: jest.fn(), releaseIncrement: jest.fn() };

    await expect(
      sendService.sendMessage(basePayload(), {
        domainService,
        accountRateLimiter,
        capService: cap,
        suppressionService: { isSuppressed: jest.fn().mockResolvedValue(false) },
        mimeTransport: { sendMail: jest.fn() },
      })
    ).rejects.toMatchObject({ code: 'DOMAIN_SUSPENDED' });

    expect(cap.checkAndIncrement).not.toHaveBeenCalled();
  });

  it('422 INVALID_RECIPIENT for a malformed address', async () => {
    const domainService = { getDomainMeta: jest.fn().mockResolvedValue(verifiedMeta) };
    const accountRateLimiter = {
      checkAndIncrement: jest.fn().mockResolvedValue({ allowed: true, limit: 600, retryAfterSeconds: 60 }),
    };
    const suppressionService = { isSuppressed: jest.fn() };

    await expect(
      sendService.sendMessage(
        { ...basePayload(), to: 'not-an-email' },
        {
          domainService,
          accountRateLimiter,
          suppressionService,
          mimeTransport: { sendMail: jest.fn() },
        }
      )
    ).rejects.toMatchObject({ code: 'INVALID_RECIPIENT' });

    expect(suppressionService.isSuppressed).not.toHaveBeenCalled();
  });

  it('422 INVALID_RECIPIENT for ReDoS-shaped input without hanging', async () => {
    const domainService = { getDomainMeta: jest.fn().mockResolvedValue(verifiedMeta) };
    const accountRateLimiter = {
      checkAndIncrement: jest.fn().mockResolvedValue({ allowed: true, limit: 600, retryAfterSeconds: 60 }),
    };
    const suppressionService = { isSuppressed: jest.fn() };
    const evil = `!@!${'!.'.repeat(20000)}`;

    const started = Date.now();
    await expect(
      sendService.sendMessage(
        { ...basePayload(), to: evil },
        {
          domainService,
          accountRateLimiter,
          suppressionService,
          mimeTransport: { sendMail: jest.fn() },
        }
      )
    ).rejects.toMatchObject({ code: 'INVALID_RECIPIENT' });
    expect(Date.now() - started).toBeLessThan(500);
    expect(suppressionService.isSuppressed).not.toHaveBeenCalled();
  });

  it('422 RECIPIENT_SUPPRESSED', async () => {
    const domainService = { getDomainMeta: jest.fn().mockResolvedValue(verifiedMeta) };
    const accountRateLimiter = {
      checkAndIncrement: jest.fn().mockResolvedValue({ allowed: true, limit: 600, retryAfterSeconds: 60 }),
    };
    const cap = { checkAndIncrement: jest.fn() };

    await expect(
      sendService.sendMessage(basePayload(), {
        domainService,
        accountRateLimiter,
        capService: cap,
        suppressionService: { isSuppressed: jest.fn().mockResolvedValue(true) },
        mimeTransport: { sendMail: jest.fn() },
      })
    ).rejects.toMatchObject({ code: 'RECIPIENT_SUPPRESSED' });

    expect(cap.checkAndIncrement).not.toHaveBeenCalled();
  });

  it('429 DAILY_LIMIT_REACHED with a resetAt', async () => {
    const domainService = { getDomainMeta: jest.fn().mockResolvedValue(verifiedMeta) };
    const accountRateLimiter = {
      checkAndIncrement: jest.fn().mockResolvedValue({ allowed: true, limit: 600, retryAfterSeconds: 60 }),
    };
    const mimeTransport = { sendMail: jest.fn() };

    await expect(
      sendService.sendMessage(basePayload(), {
        domainService,
        accountRateLimiter,
        capService: {
          checkAndIncrement: jest.fn().mockResolvedValue({
            allowed: false,
            remaining: 0,
            resetAt: 1_700_000_000_000,
          }),
        },
        suppressionService: { isSuppressed: jest.fn().mockResolvedValue(false) },
        mimeTransport,
      })
    ).rejects.toMatchObject({ code: 'DAILY_LIMIT_REACHED', resetAt: 1_700_000_000_000 });

    expect(mimeTransport.sendMail).not.toHaveBeenCalled();
  });

  it('413 over OUTBOUND_MAX_MESSAGE_BYTES, before the relay is contacted', async () => {
    const domainService = { getDomainMeta: jest.fn().mockResolvedValue(verifiedMeta) };
    const accountRateLimiter = {
      checkAndIncrement: jest.fn().mockResolvedValue({ allowed: true, limit: 600, retryAfterSeconds: 60 }),
    };
    const mimeTransport = { sendMail: jest.fn() };
    const huge = 'x'.repeat(11 * 1024 * 1024);

    await expect(
      sendService.sendMessage(
        { ...basePayload(), text: huge },
        {
          domainService,
          accountRateLimiter,
          capService: {
            checkAndIncrement: jest.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: 1 }),
            releaseIncrement: jest.fn(),
          },
          suppressionService: { isSuppressed: jest.fn().mockResolvedValue(false) },
          mimeTransport,
        }
      )
    ).rejects.toMatchObject({ code: 'MESSAGE_TOO_LARGE' });

    expect(mimeTransport.sendMail).not.toHaveBeenCalled();
  });

  it('503 and cap NOT consumed when Postfix SMTP submission fails', async () => {
    await redisService.client.set(
      'outbound:domain:meta:mail.example.com',
      JSON.stringify({ ...verifiedMeta, dailyLimit: 100 })
    );

    const domainService = {
      getDomainMeta: jest.fn().mockResolvedValue(verifiedMeta),
    };
    const accountRateLimiter = {
      checkAndIncrement: jest.fn().mockResolvedValue({ allowed: true, limit: 600, retryAfterSeconds: 60 }),
    };
    const before = await capService.peekCounter('mail.example.com');

    await expect(
      sendService.sendMessage(basePayload(), {
        domainService,
        accountRateLimiter,
        capService,
        messageStore,
        suppressionService: { isSuppressed: jest.fn().mockResolvedValue(false) },
        mimeTransport: {
          sendMail: jest.fn().mockRejectedValue(new Error('connection refused')),
        },
      })
    ).rejects.toMatchObject({ code: 'RELAY_UNAVAILABLE' });

    expect(await capService.peekCounter('mail.example.com')).toBe(before);
  });

  it('202 on success; idempotency replay returns the identical first response', async () => {
    const domainService = { getDomainMeta: jest.fn().mockResolvedValue(verifiedMeta) };
    const accountRateLimiter = {
      checkAndIncrement: jest.fn().mockResolvedValue({ allowed: true, limit: 600, retryAfterSeconds: 60 }),
    };
    const relayTransportMock = { sendMail: jest.fn().mockResolvedValue({ messageId: 'smtp-1' }) };
    const deps = {
      domainService,
      accountRateLimiter,
      capService: {
        checkAndIncrement: jest.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: 1 }),
        releaseIncrement: jest.fn(),
      },
      messageStore,
      suppressionService: { isSuppressed: jest.fn().mockResolvedValue(false) },
      mimeTransport: relayTransportMock,
    };

    const first = await sendService.sendMessage(
      { ...basePayload(), idempotencyKey: 'abc' },
      deps
    );
    expect(first).toMatchObject({ id: expect.any(String), status: 'queued' });

    const second = await sendService.sendMessage(
      { ...basePayload(), idempotencyKey: 'abc' },
      deps
    );
    expect(second).toEqual(first);
    expect(relayTransportMock.sendMail).toHaveBeenCalledTimes(1);

    await expect(
      sendService.sendMessage(
        { ...basePayload(), idempotencyKey: 'abc', to: 'DIFFERENT@example.org' },
        deps
      )
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(relayTransportMock.sendMail).toHaveBeenCalledTimes(1);

    const mailArgs = relayTransportMock.sendMail.mock.calls[0][0];
    expect(mailArgs.envelope.from).toBe(`b-${first.id}@hm-bounce.mail.example.com`);
    expect(mailArgs.dkim).toMatchObject({
      domainName: 'mail.example.com',
      keySelector: 'hmtest',
      privateKey: testPrivateKeyPem,
    });
  });

  it('concurrent same-key requests send exactly once', async () => {
    const domainService = { getDomainMeta: jest.fn().mockResolvedValue(verifiedMeta) };
    const accountRateLimiter = {
      checkAndIncrement: jest.fn().mockResolvedValue({ allowed: true, limit: 600, retryAfterSeconds: 60 }),
    };

    let releaseMail;
    const mailGate = new Promise((resolve) => {
      releaseMail = resolve;
    });
    const relayTransportMock = {
      sendMail: jest.fn().mockImplementation(async () => {
        await mailGate;
        return { messageId: 'smtp-1' };
      }),
    };

    const deps = {
      domainService,
      accountRateLimiter,
      capService: {
        checkAndIncrement: jest.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: 1 }),
        releaseIncrement: jest.fn(),
      },
      messageStore,
      suppressionService: { isSuppressed: jest.fn().mockResolvedValue(false) },
      mimeTransport: relayTransportMock,
    };

    const p1 = sendService.sendMessage({ ...basePayload(), idempotencyKey: 'concurrent-1' }, deps);
    const p2 = sendService.sendMessage({ ...basePayload(), idempotencyKey: 'concurrent-1' }, deps);

    // Let p1 reach sendMail and p2 hit the pending reservation
    await Promise.resolve();
    await Promise.resolve();
    releaseMail();

    const results = await Promise.allSettled([p1, p2]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ code: 'IDEMPOTENCY_IN_FLIGHT' });
    expect(relayTransportMock.sendMail).toHaveBeenCalledTimes(1);
  });

  it('Redis failure after relay acceptance does not cause a duplicate on retry', async () => {
    const domainService = { getDomainMeta: jest.fn().mockResolvedValue(verifiedMeta) };
    const accountRateLimiter = {
      checkAndIncrement: jest.fn().mockResolvedValue({ allowed: true, limit: 600, retryAfterSeconds: 60 }),
    };
    const relayTransportMock = { sendMail: jest.fn().mockResolvedValue({ messageId: 'smtp-1' }) };
    const failingStore = {
      ...messageStore,
      createMessage: jest.fn().mockRejectedValueOnce(new Error('ECONNRESET')),
    };

    const deps = {
      domainService,
      accountRateLimiter,
      capService: {
        checkAndIncrement: jest.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: 1 }),
        releaseIncrement: jest.fn(),
      },
      messageStore: failingStore,
      suppressionService: { isSuppressed: jest.fn().mockResolvedValue(false) },
      mimeTransport: relayTransportMock,
    };

    await expect(
      sendService.sendMessage({ ...basePayload(), idempotencyKey: 'redis-fail-1' }, deps)
    ).rejects.toThrow('ECONNRESET');
    expect(relayTransportMock.sendMail).toHaveBeenCalledTimes(1);

    // Retry after Redis recovers must NOT re-send
    await expect(
      sendService.sendMessage({ ...basePayload(), idempotencyKey: 'redis-fail-1' }, { ...deps, messageStore })
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_IN_FLIGHT' });
    expect(relayTransportMock.sendMail).toHaveBeenCalledTimes(1);
  });

  it('reconciles pending idempotency record if message was persisted before storeReplay failed', async () => {
    const domainService = { getDomainMeta: jest.fn().mockResolvedValue(verifiedMeta) };
    const accountRateLimiter = {
      checkAndIncrement: jest.fn().mockResolvedValue({ allowed: true, limit: 600, retryAfterSeconds: 60 }),
    };
    const relayTransportMock = { sendMail: jest.fn().mockResolvedValue({ messageId: 'smtp-1' }) };
    const failingReplayStore = {
      ...messageStore,
      storeReplay: jest.fn().mockRejectedValueOnce(new Error('Redis write timeout')),
    };

    const deps = {
      domainService,
      accountRateLimiter,
      capService: {
        checkAndIncrement: jest.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: 1 }),
        releaseIncrement: jest.fn(),
      },
      messageStore: failingReplayStore,
      suppressionService: { isSuppressed: jest.fn().mockResolvedValue(false) },
      mimeTransport: relayTransportMock,
    };

    await expect(
      sendService.sendMessage({ ...basePayload(), idempotencyKey: 'redis-fail-2' }, deps)
    ).rejects.toThrow('Redis write timeout');
    expect(relayTransportMock.sendMail).toHaveBeenCalledTimes(1);

    // Retry reconciles from persisted message without calling sendMail again
    const retryResult = await sendService.sendMessage(
      { ...basePayload(), idempotencyKey: 'redis-fail-2' },
      { ...deps, messageStore }
    );
    expect(retryResult).toMatchObject({ id: expect.any(String), status: 'queued' });
    expect(relayTransportMock.sendMail).toHaveBeenCalledTimes(1);
  });

  it('releases idempotency reservation when relay fails so client can retry', async () => {
    const domainService = { getDomainMeta: jest.fn().mockResolvedValue(verifiedMeta) };
    const accountRateLimiter = {
      checkAndIncrement: jest.fn().mockResolvedValue({ allowed: true, limit: 600, retryAfterSeconds: 60 }),
    };
    const relayTransportMock = {
      sendMail: jest
        .fn()
        .mockRejectedValueOnce(new Error('transient smtp error'))
        .mockResolvedValueOnce({ messageId: 'smtp-2' }),
    };

    const deps = {
      domainService,
      accountRateLimiter,
      capService: {
        checkAndIncrement: jest.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: 1 }),
        releaseIncrement: jest.fn(),
      },
      messageStore,
      suppressionService: { isSuppressed: jest.fn().mockResolvedValue(false) },
      mimeTransport: relayTransportMock,
    };

    await expect(
      sendService.sendMessage({ ...basePayload(), idempotencyKey: 'retry-after-503' }, deps)
    ).rejects.toMatchObject({ code: 'RELAY_UNAVAILABLE' });

    const second = await sendService.sendMessage(
      { ...basePayload(), idempotencyKey: 'retry-after-503' },
      deps
    );
    expect(second).toMatchObject({ id: expect.any(String), status: 'queued' });
    expect(relayTransportMock.sendMail).toHaveBeenCalledTimes(2);
  });

  it('persists subject, from, envelopeFrom, clientIp, and sendKeyName on the message record', async () => {
    const domainService = { getDomainMeta: jest.fn().mockResolvedValue(verifiedMeta) };
    const accountRateLimiter = {
      checkAndIncrement: jest.fn().mockResolvedValue({ allowed: true, limit: 600, retryAfterSeconds: 60 }),
    };
    const deps = {
      domainService,
      accountRateLimiter,
      capService: {
        checkAndIncrement: jest.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: 1 }),
        releaseIncrement: jest.fn(),
      },
      messageStore,
      suppressionService: { isSuppressed: jest.fn().mockResolvedValue(false) },
      mimeTransport: { sendMail: jest.fn().mockResolvedValue({ messageId: 'smtp-1' }) },
    };

    const result = await sendService.sendMessage(
      {
        ...basePayload(),
        clientIp: '198.51.100.20',
        sendKeyName: 'ci',
      },
      deps
    );

    const stored = await messageStore.getMessage(result.id);
    expect(stored).toMatchObject({
      subject: 'Invoice',
      from: { name: 'Example', email: 'billing@mail.example.com' },
      envelopeFrom: `b-${result.id}@hm-bounce.mail.example.com`,
      clientIp: '198.51.100.20',
      sendKeyName: 'ci',
      recipient: 'client@example.org',
    });
    expect(stored.body).toBeUndefined();
    expect(stored.text).toBeUndefined();
    expect(stored.html).toBeUndefined();
  });
});
