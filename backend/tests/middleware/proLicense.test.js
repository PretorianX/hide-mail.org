process.env.VALID_DOMAINS = 'hide-mail.org';

const licenseService = require('../../services/licenseService');
const redisService = require('../../services/redisService');
const { attachLicense, requirePro } = require('../../middleware/proLicense');

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

describe('proLicense middleware', () => {
  beforeEach(() => {
    redisService.client.data = {};
  });

  it('attaches a valid license from X-License-Key', async () => {
    const created = await licenseService.createLicense({
      type: 'pro',
      plan: 'monthly',
      orderReference: 'pro-monthly-mw',
      ttlSeconds: 3600,
    });
    const req = { headers: { 'x-license-key': created.key } };
    const next = jest.fn();
    await attachLicense(req, jsonRes(), next);
    expect(next).toHaveBeenCalled();
    expect(req.license.key).toBe(created.key);
  });

  it('leaves req.license null when the header is missing', async () => {
    const req = { headers: {} };
    const next = jest.fn();
    await attachLicense(req, jsonRes(), next);
    expect(req.license).toBeNull();
    expect(next).toHaveBeenCalled();
  });

  it('requirePro returns 403 without an active Pro license', async () => {
    const req = { license: null };
    const res = jsonRes();
    await requirePro(req, res, () => {
      throw new Error('should not continue');
    });
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('PRO_REQUIRED');
  });
});
