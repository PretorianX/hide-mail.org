process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.PREMIUM_DOMAINS = 'pro-hide-mail.org';
process.env.EMAIL_EXPIRATION_SECONDS = '1800';
process.env.FORWARDING_FREE_LIMIT = '2';
process.env.FORWARDING_PRO_LIMIT = '100';

const redisService = require('../../services/redisService');
const licenseService = require('../../services/licenseService');
const emailController = require('../../controllers/emailController');
const forwardingService = require('../../services/forwardingService');

jest.mock('../../services/metricsService', () => ({
  mailboxesRegisteredTotal: { inc: jest.fn() },
  mailboxesRefreshedTotal: { inc: jest.fn() },
  mailboxesDeactivatedTotal: { inc: jest.fn() },
  forwardingOtpRequestsTotal: { inc: jest.fn() },
  forwardingOtpVerificationsTotal: { inc: jest.fn() },
  forwardingEmailsTotal: { inc: jest.fn() },
}));

const jsonRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
};

describe('Pro mailbox entitlements', () => {
  let proLicense;

  beforeEach(async () => {
    redisService.client.data = {};
    await redisService.initializeDomains(['hide-mail.org', 'pro-hide-mail.org']);
    proLicense = await licenseService.createLicense({
      type: 'pro',
      plan: 'monthly',
      orderReference: 'pro-monthly-ent',
      ttlSeconds: 3600,
    });
  });

  it('registers a free mailbox with the default 1800s TTL', async () => {
    const registerSpy = jest.spyOn(redisService, 'registerMailbox');
    const res = jsonRes();
    await emailController.registerMailbox(
      { body: { email: 'random@hide-mail.org' } },
      res,
      (err) => { throw err; }
    );

    expect(res.statusCode).toBe(200);
    expect(registerSpy).toHaveBeenCalledWith('random@hide-mail.org', 1800);
    registerSpy.mockRestore();
  });

  it('registers a Pro mailbox with a chosen 24h TTL', async () => {
    const registerSpy = jest.spyOn(redisService, 'registerMailbox');
    const res = jsonRes();
    await emailController.registerMailbox(
      {
        body: { email: 'anna@hide-mail.org', ttlSeconds: 86400, alias: 'anna' },
        license: proLicense,
      },
      res,
      (err) => { throw err; }
    );

    expect(res.statusCode).toBe(200);
    expect(registerSpy).toHaveBeenCalledWith('anna@hide-mail.org', 86400);
    registerSpy.mockRestore();
  });

  it('rejects a custom alias without a Pro license', async () => {
    const res = jsonRes();
    await emailController.registerMailbox(
      { body: { email: 'anna@hide-mail.org', alias: 'anna' } },
      res,
      (err) => { throw err; }
    );

    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('PRO_REQUIRED');
  });

  it('rejects a taken custom alias so the free funnel can upsell Pro', async () => {
    await redisService.registerMailbox('anna@hide-mail.org', 1800);
    const res = jsonRes();
    await emailController.registerMailbox(
      {
        body: { email: 'anna@hide-mail.org', alias: 'anna' },
        license: proLicense,
      },
      res,
      (err) => { throw err; }
    );

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('ALIAS_TAKEN');
  });

  it('rejects a premium domain without a Pro license', async () => {
    const res = jsonRes();
    await emailController.registerMailbox(
      { body: { email: 'user@pro-hide-mail.org' } },
      res,
      (err) => { throw err; }
    );

    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('PREMIUM_DOMAIN');
  });

  it('allows a premium domain with a Pro license', async () => {
    const res = jsonRes();
    await emailController.registerMailbox(
      {
        body: { email: 'user@pro-hide-mail.org' },
        license: proLicense,
      },
      res,
      (err) => { throw err; }
    );

    expect(res.statusCode).toBe(200);
  });

  it('returns premium domains only when a Pro license is present', async () => {
    const freeRes = jsonRes();
    await emailController.getDomains({ license: null }, freeRes, (err) => { throw err; });
    expect(freeRes.body.data).toEqual(['hide-mail.org']);
    expect(freeRes.body.premium).toEqual([]);

    const proRes = jsonRes();
    await emailController.getDomains({ license: proLicense }, proRes, (err) => { throw err; });
    expect(proRes.body.data).toEqual(expect.arrayContaining(['hide-mail.org', 'pro-hide-mail.org']));
    expect(proRes.body.premium).toEqual(['pro-hide-mail.org']);
  });
});

describe('Forwarding limits', () => {
  beforeEach(() => {
    redisService.client.data = {};
  });

  it('uses the free teaser limit of 2 forwards per mailbox', async () => {
    jest.spyOn(redisService, 'isMailboxActive').mockResolvedValue(true);
    const stats = await require('../../services/rateLimiter').checkRateLimit('free@hide-mail.org', 2);
    expect(stats.limit).toBe(2);
    expect(stats.allowed).toBe(true);
  });
});
