process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.OUTBOUND_KEY_ENCRYPTION_SECRET = 'test-secret-for-outbound-domain-keys';

const redisService = require('../../../services/redisService');
const accountService = require('../../../services/outbound/accountService');
const metricsTokenService = require('../../../services/outbound/metricsTokenService');

describe('metricsTokenService', () => {
  beforeEach(() => {
    redisService.client.data = {};
  });

  it('rotates a hm_metrics_ token and invalidates the previous one', async () => {
    const account = await accountService.createAccount({ label: 'Acme', days: 30 });
    const first = await metricsTokenService.rotateMetricsToken({ accountId: account.accountId });
    expect(first.key).toMatch(/^hm_metrics_[0-9a-f]{48}$/);
    expect(first.scrapeConfig.authorization.credentials).toBe(first.key);
    expect(first.scrapeConfig.static_configs).toEqual([{ targets: ['hide-mail.org'] }]);
    expect(first.scrapeConfig.metrics_path).toBe('/api/outbound/metrics');


    expect(await metricsTokenService.validateMetricsToken(first.key)).toEqual({
      accountId: account.accountId,
    });

    const second = await metricsTokenService.rotateMetricsToken({ accountId: account.accountId });
    expect(second.key).not.toBe(first.key);
    expect(await metricsTokenService.validateMetricsToken(first.key)).toBeNull();
    expect(await metricsTokenService.validateMetricsToken(second.key)).toEqual({
      accountId: account.accountId,
    });
  });

  it('getMetricsTokenMeta returns masked key without the raw secret', async () => {
    const account = await accountService.createAccount({ label: 'Acme', days: 30 });
    expect(await metricsTokenService.getMetricsTokenMeta({ accountId: account.accountId })).toBeNull();

    const rotated = await metricsTokenService.rotateMetricsToken({ accountId: account.accountId });
    const meta = await metricsTokenService.getMetricsTokenMeta({ accountId: account.accountId });
    expect(meta.maskedKey).toMatch(/^\*{4}[0-9a-f]{4}$/);
    expect(meta).not.toHaveProperty('key');
    expect(JSON.stringify(meta)).not.toContain(rotated.key);
    expect(meta.scrapeConfig.authorization).toBeUndefined();
  });

  it('rejects send keys and licence-shaped strings', async () => {
    expect(await metricsTokenService.validateMetricsToken('hm_send_abc')).toBeNull();
    expect(await metricsTokenService.validateMetricsToken('HM-AAAA-BBBB-CCCC-DDDD')).toBeNull();
  });
});
