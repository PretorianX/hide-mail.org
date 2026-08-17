process.env.VALID_DOMAINS = 'hide-mail.org';

const licenseService = require('../../services/licenseService');
const redisService = require('../../services/redisService');
const metrics = require('../../services/metricsService');

describe('licenseService', () => {
  beforeEach(async () => {
    redisService.client.data = {};
  });

  describe('createLicense', () => {
    it('stores a Pro license in Redis and returns a key the client can restore', async () => {
      const license = await licenseService.createLicense({
        type: 'pro',
        plan: 'monthly',
        orderReference: 'pro-monthly-abc',
        recToken: 'rec-1',
        ttlSeconds: 31 * 24 * 60 * 60,
      });

      expect(license.key).toMatch(/^HM-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      expect(license.type).toBe('pro');
      expect(license.plan).toBe('monthly');
      expect(license.orderReference).toBe('pro-monthly-abc');

      const stored = await licenseService.getLicense(license.key);
      expect(stored.key).toBe(license.key);
      expect(stored.status).toBe('active');
    });

    it('creates an API license that can issue an API key', async () => {
      const license = await licenseService.createLicense({
        type: 'api',
        plan: 'monthly',
        orderReference: 'api-monthly-abc',
        ttlSeconds: 31 * 24 * 60 * 60,
      });
      const apiKey = await licenseService.createApiKey(license.key);

      expect(apiKey).toMatch(/^hm_api_/);
      const resolved = await licenseService.validateApiKey(apiKey);
      expect(resolved.licenseKey).toBe(license.key);
      expect(resolved.type).toBe('api');
    });

    it('issues API keys with a 30-day lifetime even if the license is yearly', async () => {
      const thirtyDays = 30 * 24 * 60 * 60;
      const license = await licenseService.createLicense({
        type: 'api',
        plan: 'yearly',
        orderReference: 'api-yearly-long',
        ttlSeconds: 366 * 24 * 60 * 60,
      });

      const expireSpy = jest.spyOn(redisService.client, 'expire');
      const apiKey = await licenseService.createApiKey(license.key);
      const apiExpire = expireSpy.mock.calls.find(([key]) => String(key).includes(apiKey));

      expect(apiExpire[1]).toBe(thirtyDays);
      const resolved = await licenseService.validateApiKey(apiKey);
      expect(resolved.remainingDays).toBe(30);
      expireSpy.mockRestore();
    });
  });

  describe('validateLicense', () => {
    it('returns the license when the key is active', async () => {
      const created = await licenseService.createLicense({
        type: 'pro',
        plan: 'yearly',
        orderReference: 'pro-yearly-1',
        ttlSeconds: 366 * 24 * 60 * 60,
      });

      const validated = await licenseService.validateLicense(created.key);
      expect(validated.active).toBe(true);
      expect(validated.type).toBe('pro');
      expect(validated.remainingDays).toBe(366);
    });

    it('returns inactive for an unknown key', async () => {
      const validated = await licenseService.validateLicense('HM-XXXX-XXXX-XXXX-XXXX');
      expect(validated.active).toBe(false);
    });
  });

  describe('renew and revoke', () => {
    it('renews TTL on Approved recurring charge via orderReference', async () => {
      const created = await licenseService.createLicense({
        type: 'pro',
        plan: 'monthly',
        orderReference: 'pro-monthly-first',
        recToken: 'rec-token-9',
        ttlSeconds: 60,
      });

      const renewed = await licenseService.renewByPayment({
        orderReference: 'pro-monthly-second',
        recToken: 'rec-token-9',
        ttlSeconds: 120,
      });

      expect(renewed.key).toBe(created.key);
      const stored = await licenseService.getLicense(created.key);
      expect(stored.orderReference).toBe('pro-monthly-second');
    });

    it('revokes a license so validation fails', async () => {
      const created = await licenseService.createLicense({
        type: 'pro',
        plan: 'monthly',
        orderReference: 'pro-monthly-ref',
        ttlSeconds: 3600,
      });

      await licenseService.revokeLicense(created.key);
      const validated = await licenseService.validateLicense(created.key);
      expect(validated.active).toBe(false);
    });

    it('revokes by orderReference on Refunded', async () => {
      const created = await licenseService.createLicense({
        type: 'pro',
        plan: 'monthly',
        orderReference: 'pro-monthly-refund',
        ttlSeconds: 3600,
      });

      await licenseService.revokeByPayment({ orderReference: 'pro-monthly-refund' });
      const validated = await licenseService.validateLicense(created.key);
      expect(validated.active).toBe(false);
    });
  });

  describe('findByOrderReference', () => {
    it('returns the license created for that order', async () => {
      const created = await licenseService.createLicense({
        type: 'pro',
        plan: 'monthly',
        orderReference: 'lookup-me',
        ttlSeconds: 3600,
      });

      const found = await licenseService.findByOrderReference('lookup-me');
      expect(found.key).toBe(created.key);
    });
  });

  describe('metrics', () => {
    beforeEach(() => {
      metrics.licensesCreatedTotal.inc.mockClear();
      metrics.licensesRevokedTotal.inc.mockClear();
      metrics.licenseValidationsTotal.inc.mockClear();
      metrics.apiKeyValidationsTotal.inc.mockClear();
    });

    it('counts a created license by type and plan', async () => {
      await licenseService.createLicense({
        type: 'api',
        plan: 'monthly',
        orderReference: 'api-metrics',
        ttlSeconds: 3600,
      });

      expect(metrics.licensesCreatedTotal.inc).toHaveBeenCalledWith({
        type: 'api',
        plan: 'monthly',
      });
    });

    it('separates a wrong key from an expired one when validating', async () => {
      const created = await licenseService.createLicense({
        type: 'pro',
        plan: 'monthly',
        orderReference: 'pro-metrics',
        ttlSeconds: 3600,
      });

      await licenseService.validateLicense(created.key);
      expect(metrics.licenseValidationsTotal.inc).toHaveBeenCalledWith({ result: 'active' });

      await licenseService.validateLicense('HM-ZZZZ-ZZZZ-ZZZZ-ZZZZ');
      expect(metrics.licenseValidationsTotal.inc).toHaveBeenCalledWith({ result: 'not_found' });

      const stored = await licenseService.getLicense(created.key);
      stored.expiresAt = Date.now() - 1000;
      redisService.client.data[`license:${created.key}`] = JSON.stringify(stored);

      await licenseService.validateLicense(created.key);
      expect(metrics.licenseValidationsTotal.inc).toHaveBeenCalledWith({ result: 'expired' });
    });

    it('counts a revoked license by type', async () => {
      const created = await licenseService.createLicense({
        type: 'pro',
        plan: 'yearly',
        orderReference: 'pro-revoke-metrics',
        ttlSeconds: 3600,
      });

      await licenseService.revokeLicense(created.key);

      expect(metrics.licensesRevokedTotal.inc).toHaveBeenCalledWith({ type: 'pro' });
    });

    it('counts API key validations by outcome', async () => {
      const license = await licenseService.createLicense({
        type: 'api',
        plan: 'monthly',
        orderReference: 'api-key-metrics',
        ttlSeconds: 3600,
      });
      const apiKey = await licenseService.createApiKey(license.key);

      await licenseService.validateApiKey(apiKey);
      expect(metrics.apiKeyValidationsTotal.inc).toHaveBeenCalledWith({ result: 'active' });

      await licenseService.validateApiKey('hm_api_nope');
      expect(metrics.apiKeyValidationsTotal.inc).toHaveBeenCalledWith({ result: 'not_found' });

      await licenseService.validateApiKey(null);
      expect(metrics.apiKeyValidationsTotal.inc).toHaveBeenCalledWith({ result: 'missing' });
    });
  });
});
