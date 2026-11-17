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
      { ...basePayload(), idempotencyKey: 'abc', to: 'DIFFERENT@example.org' },
      deps
    );
    expect(second).toEqual(first);
    expect(relayTransportMock.sendMail).toHaveBeenCalledTimes(1);

    const mailArgs = relayTransportMock.sendMail.mock.calls[0][0];
    expect(mailArgs.envelope.from).toBe(`b-${first.id}@hm-bounce.mail.example.com`);
    expect(mailArgs.dkim).toMatchObject({
      domainName: 'mail.example.com',
      keySelector: 'hmtest',
      privateKey: testPrivateKeyPem,
    });
  });
});
