process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.OUTBOUND_KEY_ENCRYPTION_SECRET = 'test-secret-for-outbound-domain-keys';
process.env.ADMIN_EMAIL = 'admin@hide-mail.org';
process.env.ADMIN_PASSWORD = 'test-admin-password';
process.env.ADMIN_SESSION_SECRET = 'test-admin-session-secret';

const redisService = require('../../services/redisService');
const adminLicenseService = require('../../services/adminLicenseService');
const licenseService = require('../../services/licenseService');

describe('adminLicenseService', () => {
  beforeEach(() => {
    redisService.client.data = {};
  });

  it('creates an outbound licence, lists only a masked key, and deletes it', async () => {
    const created = await adminLicenseService.createLicense({
      type: 'outbound',
      days: 30,
      label: 'acme',
      ratePerMinute: 120,
      dailyLimitDefault: 500,
    });

    expect(created.key).toMatch(/^HM-/);
    expect(created.maskedKey).toBe(licenseService.maskKey(created.key));
    expect(created.type).toBe('outbound');
    expect(created.ratePerMinute).toBe(120);
    expect(created.dailyLimitDefault).toBe(500);

    const listed = await adminLicenseService.listLicenses();
    expect(listed).toHaveLength(1);
    expect(listed[0].key).toBeUndefined();
    expect(listed[0].id).not.toBe(created.key);
    expect(listed[0].maskedKey).toBe(created.maskedKey);
    expect(JSON.stringify(listed)).not.toContain(created.key);

    await expect(adminLicenseService.deleteLicense(listed[0].id)).resolves.toBe(true);
    await expect(adminLicenseService.listLicenses()).resolves.toEqual([]);
  });

  it('treats omitted outbound daily limit as unlimited and stamps new domains with null', async () => {
    const created = await adminLicenseService.createLicense({
      type: 'outbound',
      days: 30,
      label: 'uncapped',
    });

    expect(created.dailyLimitDefault).toBeNull();

    const domainService = require('../../services/outbound/domainService');
    const added = await domainService.addDomain({
      accountId: created.accountId,
      domain: 'uncapped.example.com',
    });
    const redisService = require('../../services/redisService');
    const meta = JSON.parse(
      await redisService.client.get('outbound:domain:meta:uncapped.example.com')
    );
    expect(meta.dailyLimit).toBeNull();
    expect(added.domain).toBe('uncapped.example.com');
  });

  it('creates a suite licence with a label', async () => {
    const created = await adminLicenseService.createLicense({
      type: 'suite',
      days: 14,
      label: 'partner',
      plan: 'monthly',
    });
    expect(created.type).toBe('suite');
    expect(created.label).toBe('partner');
    expect(created.key).toMatch(/^HM-/);
  });

  it('issues a usable hm_api_ key when creating a QA (api) licence', async () => {
    const created = await adminLicenseService.createLicense({
      type: 'api',
      days: 30,
      label: 'qa-ci',
    });

    expect(created.key).toMatch(/^HM-/);
    expect(created.apiKey).toMatch(/^hm_api_/);
    const resolved = await licenseService.validateApiKey(created.apiKey);
    expect(resolved).toMatchObject({ type: 'api' });
    expect(resolved.license.key).toBe(created.key);

    const listed = await adminLicenseService.listLicenses();
    expect(JSON.stringify(listed)).not.toContain(created.apiKey);
    expect(listed[0].apiKey).toBeUndefined();
  });

  it('issues an hm_api_ key for each tool/suite type that can use the API', async () => {
    for (const type of ['grade', 'sender', 'reports', 'bounce', 'complaint', 'tls', 'access', 'suite']) {
      const created = await adminLicenseService.createLicense({ type, days: 7 });
      expect(created.apiKey).toMatch(/^hm_api_/);
      const resolved = await licenseService.validateApiKey(created.apiKey);
      expect(resolved.type).toBe(type);
    }
  });

  it('issues a send key with outbound by default, and skips it when issueSendKey is false', async () => {
    const withSend = await adminLicenseService.createLicense({
      type: 'outbound',
      days: 30,
      label: 'with-send',
    });
    expect(withSend.sendKey).toMatch(/^hm_send_/);
    expect(withSend.sendKeyName).toBe('default');

    const withoutSend = await adminLicenseService.createLicense({
      type: 'outbound',
      days: 30,
      label: 'no-send',
      issueSendKey: false,
    });
    expect(withoutSend.sendKey).toBeUndefined();
  });

  it('does not issue apiKey for pro licences', async () => {
    const created = await adminLicenseService.createLicense({
      type: 'pro',
      days: 30,
    });
    expect(created.key).toMatch(/^HM-/);
    expect(created.apiKey).toBeUndefined();
  });
});
