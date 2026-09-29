process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.EMAIL_EXPIRATION_SECONDS = '1800';

const redisService = require('../../services/redisService');
const licenseService = require('../../services/licenseService');
const emailController = require('../../controllers/emailController');

const jsonRes = () => ({
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
});

const register = async (body, license) => {
  const res = jsonRes();
  await emailController.registerMailbox({ body, license }, res, (err) => {
    throw err;
  });
  return res;
};

describe('registerMailbox site address guard', () => {
  let proLicense;

  beforeEach(async () => {
    redisService.client.data = {};
    await redisService.initializeDomains(['hide-mail.org']);
    proLicense = await licenseService.createLicense({
      type: 'pro',
      plan: 'monthly',
      orderReference: 'pro-site-guard',
      ttlSeconds: 3600,
    });
  });

  it('refuses an alias that would take over a live mailbox site address', async () => {
    await redisService.registerMailbox('nova7@hide-mail.org', 1800);

    const res = await register(
      { email: 'nova7.netflix@hide-mail.org', alias: 'nova7.netflix' },
      proLicense
    );

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('ALIAS_TAKEN');
  });

  it('allows an alias that only shares a prefix with no live mailbox', async () => {
    const res = await register(
      { email: 'nova7.netflix@hide-mail.org', alias: 'nova7.netflix' },
      proLicense
    );

    expect(res.statusCode).toBe(200);
  });

  it('allows a dotted alias when the shorter mailbox is not active', async () => {
    await redisService.registerMailbox('someone-else@hide-mail.org', 1800);

    const res = await register(
      { email: 'john.doe@hide-mail.org', alias: 'john.doe' },
      proLicense
    );

    expect(res.statusCode).toBe(200);
  });
});
