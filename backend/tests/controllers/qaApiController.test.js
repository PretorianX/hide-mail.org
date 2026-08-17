process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.EMAIL_EXPIRATION_SECONDS = '1800';

const redisService = require('../../services/redisService');
const licenseService = require('../../services/licenseService');
const qaApiController = require('../../controllers/qaApiController');

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

describe('QA API', () => {
  let apiLicense;
  let apiKey;

  beforeEach(async () => {
    redisService.client.data = {};
    await redisService.initializeDomains(['hide-mail.org']);
    apiLicense = await licenseService.createLicense({
      type: 'api',
      plan: 'monthly',
      orderReference: 'api-monthly-qa',
      ttlSeconds: 3600,
    });
    apiKey = await licenseService.createApiKey(apiLicense.key);
  });

  it('creates a mailbox with an API key', async () => {
    const res = jsonRes();
    await qaApiController.createMailbox(
      {
        body: { domain: 'hide-mail.org' },
        apiLicense,
      },
      res,
      (err) => { throw err; }
    );

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toMatch(/@hide-mail\.org$/);
    const active = await redisService.isMailboxActive(res.body.data.email);
    expect(active).toBe(true);
  });

  it('lists messages and returns a message body', async () => {
    const email = 'qa@hide-mail.org';
    await redisService.registerMailbox(email, 1800);
    await redisService.storeEmail(email, {
      id: 'msg-1',
      from: 'a@b.com',
      subject: 'Hello',
      preview: 'Hi',
      text: 'Hello body',
      html: '<p>Hello body</p>',
      receivedAt: new Date().toISOString(),
    });

    const listRes = jsonRes();
    await qaApiController.listMessages(
      { params: { email }, apiLicense },
      listRes,
      (err) => { throw err; }
    );
    expect(listRes.body.data).toHaveLength(1);

    const getRes = jsonRes();
    await qaApiController.getMessage(
      { params: { email, id: 'msg-1' }, apiLicense },
      getRes,
      (err) => { throw err; }
    );
    expect(getRes.body.data.text).toBe('Hello body');
  });

  it('stores an inbound webhook URL for a mailbox', async () => {
    const email = 'hook@hide-mail.org';
    await redisService.registerMailbox(email, 1800);

    const res = jsonRes();
    await qaApiController.setWebhook(
      {
        params: { email },
        body: { url: 'https://example.test/inbound' },
        apiLicense,
      },
      res,
      (err) => { throw err; }
    );

    expect(res.statusCode).toBe(200);
    const stored = await redisService.getMailboxWebhook(email);
    expect(stored).toBe('https://example.test/inbound');
  });
});

describe('API key middleware', () => {
  const { requireApiKey } = require('../../middleware/apiKeyAuth');

  it('rejects missing API keys', async () => {
    const res = jsonRes();
    await requireApiKey({ headers: {} }, res, () => {
      throw new Error('should not continue');
    });
    expect(res.statusCode).toBe(401);
  });

  it('attaches the API license when the key is valid', async () => {
    redisService.client.data = {};
    const license = await licenseService.createLicense({
      type: 'api',
      plan: 'monthly',
      orderReference: 'api-monthly-mw',
      ttlSeconds: 3600,
    });
    const key = await licenseService.createApiKey(license.key);
    const req = { headers: { authorization: `Bearer ${key}` } };
    const res = jsonRes();
    const next = jest.fn();
    await requireApiKey(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.apiLicense.type).toBe('api');
  });
});
