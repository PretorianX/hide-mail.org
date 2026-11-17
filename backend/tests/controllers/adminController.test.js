process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.OUTBOUND_KEY_ENCRYPTION_SECRET = 'test-secret-for-outbound-domain-keys';
process.env.ADMIN_EMAIL = 'ops@hide-mail.org';
process.env.ADMIN_PASSWORD = 's3cret-ops';
process.env.ADMIN_SESSION_SECRET = 'session-secret-for-tests';

const adminController = require('../../controllers/adminController');
const adminSession = require('../../services/adminSession');
const redisService = require('../../services/redisService');

const createRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
  };
  return res;
};

describe('adminController', () => {
  beforeEach(() => {
    redisService.client.data = {};
  });

  it('logs in with env credentials and sets a session cookie', async () => {
    const res = createRes();
    await adminController.login(
      { body: { email: 'ops@hide-mail.org', password: 's3cret-ops' } },
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.headers['Set-Cookie']).toContain(adminSession.COOKIE_NAME);
  });

  it('rejects bad passwords', async () => {
    const res = createRes();
    await adminController.login(
      { body: { email: 'ops@hide-mail.org', password: 'wrong' } },
      res
    );
    expect(res.statusCode).toBe(401);
  });

  it('creates and lists licences without exposing secrets on list', async () => {
    const loginRes = createRes();
    await adminController.login(
      { body: { email: 'ops@hide-mail.org', password: 's3cret-ops' } },
      loginRes
    );
    const cookie = loginRes.headers['Set-Cookie'].split(';')[0];

    const createResBody = createRes();
    await adminController.createLicense(
      {
        adminSession: { sub: 'ops@hide-mail.org' },
        body: { type: 'api', days: 30, label: 'ci' },
      },
      createResBody,
      (err) => {
        throw err;
      }
    );
    expect(createResBody.statusCode).toBe(201);
    expect(createResBody.body.license.key).toMatch(/^HM-/);
    const plaintext = createResBody.body.license.key;

    const listRes = createRes();
    await adminController.listLicenses(
      { headers: { cookie }, adminSession: { sub: 'ops@hide-mail.org' } },
      listRes,
      (err) => {
        throw err;
      }
    );
    expect(listRes.statusCode).toBe(200);
    expect(listRes.body.licenses).toHaveLength(1);
    expect(JSON.stringify(listRes.body)).not.toContain(plaintext);
  });
});
