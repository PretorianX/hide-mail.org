process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.EMAIL_EXPIRATION_SECONDS = '1800';

const redisService = require('../../services/redisService');
const licenseService = require('../../services/licenseService');
jest.mock('../../services/webhookUrlGuard', () => ({
  validatePublicHttpsWebhookUrl: jest.fn(),
}));
const webhookUrlGuard = require('../../services/webhookUrlGuard');
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
    jest.spyOn(webhookUrlGuard, 'validatePublicHttpsWebhookUrl').mockResolvedValue({ ok: true });
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
    await redisService.setMailboxMeta(email, { licenseKey: apiLicense.key, alias: false }, 1800);
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
    await redisService.setMailboxMeta(email, { licenseKey: apiLicense.key, alias: false }, 1800);

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
    expect(webhookUrlGuard.validatePublicHttpsWebhookUrl).toHaveBeenCalledWith(
      'https://example.test/inbound'
    );
    const stored = await redisService.getMailboxWebhook(email);
    expect(stored).toBe('https://example.test/inbound');
  });

  it('rejects a webhook URL that resolves to an internal address', async () => {
    webhookUrlGuard.validatePublicHttpsWebhookUrl.mockRejectedValue(new Error('Invalid webhook URL'));
    const email = 'hook@hide-mail.org';
    await redisService.registerMailbox(email, 1800);
    await redisService.setMailboxMeta(email, { licenseKey: apiLicense.key, alias: false }, 1800);

    const res = jsonRes();
    await qaApiController.setWebhook(
      {
        params: { email },
        body: { url: 'https://internal.test/inbound' },
        apiLicense,
      },
      res,
      (err) => { throw err; }
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_WEBHOOK_URL');
  });

  it('refuses an alias that would take over a live mailbox site address', async () => {
    await redisService.registerMailbox('victim@hide-mail.org', 1800);

    const res = jsonRes();
    await qaApiController.createMailbox(
      {
        body: { domain: 'hide-mail.org', alias: 'victim.netflix' },
        apiLicense,
      },
      res,
      (err) => { throw err; }
    );

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('ALIAS_TAKEN');
    expect(await redisService.isMailboxActive('victim.netflix@hide-mail.org')).toBe(false);
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

describe('QA API cross-tenant isolation', () => {
  const attachmentController = require('../../controllers/attachmentController');
  let ownerLicense;
  let otherApiLicense;
  let otherSuiteLicense;
  const ownerMailbox = 'alice@hide-mail.org';
  const freeMailbox = 'freeuser@hide-mail.org';

  beforeEach(async () => {
    jest.spyOn(webhookUrlGuard, 'validatePublicHttpsWebhookUrl').mockResolvedValue({ ok: true });
    redisService.client.data = {};
    await redisService.initializeDomains(['hide-mail.org']);

    ownerLicense = await licenseService.createLicense({
      type: 'api',
      plan: 'monthly',
      orderReference: 'api-owner',
      ttlSeconds: 3600,
    });
    otherApiLicense = await licenseService.createLicense({
      type: 'api',
      plan: 'monthly',
      orderReference: 'api-attacker',
      ttlSeconds: 3600,
    });
    otherSuiteLicense = await licenseService.createLicense({
      type: 'suite',
      plan: 'monthly',
      orderReference: 'suite-attacker',
      ttlSeconds: 3600,
    });

    const createRes = jsonRes();
    await qaApiController.createMailbox(
      { body: { domain: 'hide-mail.org', alias: 'alice' }, apiLicense: ownerLicense },
      createRes,
      (err) => { throw err; }
    );
    expect(createRes.statusCode).toBe(201);

    await redisService.storeEmail(ownerMailbox, {
      id: 'msg-secret',
      from: 'bank@example.test',
      subject: 'OTP 998877',
      text: 'Secret OTP 998877',
      receivedAt: new Date().toISOString(),
      attachments: [
        {
          filename: 'secret.txt',
          contentType: 'text/plain',
          contentDisposition: 'attachment',
          cid: null,
          content: Buffer.from('top-secret').toString('base64'),
          encoding: 'base64',
        },
      ],
    });

    // Free-tier mailbox with no mailbox_meta
    await redisService.registerMailbox(freeMailbox, 1800);
    await redisService.storeEmail(freeMailbox, {
      id: 'msg-free',
      from: 'friend@example.test',
      subject: 'Private',
      text: 'Free user mail',
      receivedAt: new Date().toISOString(),
    });
  });

  it.each([
    ['other api license on owned mailbox', () => otherApiLicense, ownerMailbox],
    ['other suite license on owned mailbox', () => otherSuiteLicense, ownerMailbox],
    ['site-address alias of owned mailbox', () => otherApiLicense, 'alice.netflix@hide-mail.org'],
    ['free-tier mailbox without metadata', () => otherApiLicense, freeMailbox],
  ])('rejects list/get/download/webhook/delete for %s', async (_label, getLicense, targetEmail) => {
    const attacker = getLicense();

    const listRes = jsonRes();
    await qaApiController.listMessages(
      { params: { email: targetEmail }, apiLicense: attacker },
      listRes,
      (err) => { throw err; }
    );
    expect(listRes.statusCode).toBe(403);
    expect(listRes.body.code).toBe('MAILBOX_FORBIDDEN');

    const getRes = jsonRes();
    await qaApiController.getMessage(
      { params: { email: targetEmail, id: 'msg-secret' }, apiLicense: attacker },
      getRes,
      (err) => { throw err; }
    );
    expect(getRes.statusCode).toBe(403);
    expect(getRes.body.code).toBe('MAILBOX_FORBIDDEN');

    const dlRes = jsonRes();
    await attachmentController.downloadAttachment(
      { params: { email: targetEmail, id: 'msg-secret', index: '0' }, apiLicense: attacker },
      dlRes,
      (err) => { throw err; }
    );
    expect(dlRes.statusCode).toBe(403);
    expect(dlRes.body.code).toBe('MAILBOX_FORBIDDEN');

    const hookRes = jsonRes();
    await qaApiController.setWebhook(
      {
        params: { email: targetEmail },
        body: { url: 'https://attacker.test/hook' },
        apiLicense: attacker,
      },
      hookRes,
      (err) => { throw err; }
    );
    expect(hookRes.statusCode).toBe(403);
    expect(hookRes.body.code).toBe('MAILBOX_FORBIDDEN');
    expect(await redisService.getMailboxWebhook(targetEmail)).toBeNull();

    const delRes = jsonRes();
    await qaApiController.deleteMailbox(
      { params: { email: targetEmail }, apiLicense: attacker },
      delRes,
      (err) => { throw err; }
    );
    expect(delRes.statusCode).toBe(403);
    expect(delRes.body.code).toBe('MAILBOX_FORBIDDEN');
    expect(await redisService.isMailboxActive(ownerMailbox)).toBe(true);
  });

  it('allows the owning license to delete its own mailbox', async () => {
    const delRes = jsonRes();
    await qaApiController.deleteMailbox(
      { params: { email: ownerMailbox }, apiLicense: ownerLicense },
      delRes,
      (err) => { throw err; }
    );
    expect(delRes.statusCode).toBe(200);
    expect(await redisService.isMailboxActive(ownerMailbox)).toBe(false);
  });
});
