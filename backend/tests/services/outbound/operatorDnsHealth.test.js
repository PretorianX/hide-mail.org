process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.OUTBOUND_KEY_ENCRYPTION_SECRET = 'test-secret-for-outbound-domain-keys';
process.env.OUTBOUND_RETURN_PATH_TARGET = 'rp.hide-mail.org';
process.env.OUTBOUND_HELO_HOSTNAME = 'mail.hide-mail.org';

const redisService = require('../../../services/redisService');
const operatorDnsHealth = require('../../../services/outbound/operatorDnsHealth');

describe('operatorDnsHealth', () => {
  beforeEach(() => {
    redisService.client.data = {};
  });

  it('reports ok when MX, SPF and HELO resolve', async () => {
    const resolver = {
      resolveMx: jest.fn().mockResolvedValue([{ exchange: 'mx.hide-mail.org', priority: 10 }]),
      resolveTxt: jest.fn().mockResolvedValue([['v=spf1 ip4:1.2.3.4 -all']]),
      resolve4: jest.fn().mockResolvedValue(['1.2.3.4']),
      resolve6: jest.fn().mockRejectedValue(new Error('ENODATA')),
    };

    const health = await operatorDnsHealth.getOperatorDnsHealth({
      resolver,
      forceRefresh: true,
    });

    expect(health).toMatchObject({
      return_path_mx: 1,
      return_path_spf: 1,
      helo_a: 1,
    });
  });

  it('caches results in Redis', async () => {
    const resolver = {
      resolveMx: jest.fn().mockResolvedValue([{ exchange: 'mx.hide-mail.org', priority: 10 }]),
      resolveTxt: jest.fn().mockResolvedValue([['v=spf1 -all']]),
      resolve4: jest.fn().mockResolvedValue(['1.2.3.4']),
      resolve6: jest.fn(),
    };

    await operatorDnsHealth.getOperatorDnsHealth({ resolver, forceRefresh: true });
    await operatorDnsHealth.getOperatorDnsHealth({ resolver, forceRefresh: false });

    expect(resolver.resolveMx).toHaveBeenCalledTimes(1);
  });

  it('returns 0 when lookups fail', async () => {
    const resolver = {
      resolveMx: jest.fn().mockRejectedValue(new Error('ENOTFOUND')),
      resolveTxt: jest.fn().mockRejectedValue(new Error('ENOTFOUND')),
      resolve4: jest.fn().mockRejectedValue(new Error('ENOTFOUND')),
      resolve6: jest.fn().mockRejectedValue(new Error('ENOTFOUND')),
    };

    const health = await operatorDnsHealth.getOperatorDnsHealth({
      resolver,
      forceRefresh: true,
    });

    expect(health).toMatchObject({
      return_path_mx: 0,
      return_path_spf: 0,
      helo_a: 0,
    });
  });
});
