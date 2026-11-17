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
});
