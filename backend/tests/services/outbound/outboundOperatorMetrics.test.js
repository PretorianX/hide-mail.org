process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.OUTBOUND_KEY_ENCRYPTION_SECRET = 'test-secret-for-outbound-domain-keys';
process.env.OUTBOUND_RETURN_PATH_TARGET = 'rp.hide-mail.org';
process.env.OUTBOUND_HELO_HOSTNAME = 'mail.hide-mail.org';

const redisService = require('../../../services/redisService');
const store = require('../../../services/outbound/outboundMetricsStore');
const operatorMetrics = require('../../../services/outbound/outboundOperatorMetrics');
const operatorDnsHealth = require('../../../services/outbound/operatorDnsHealth');
const promClient = require('prom-client');

const META_PREFIX = 'outbound:domain:meta:';

describe('outboundOperatorMetrics', () => {
  beforeEach(() => {
    redisService.client.data = {};
    operatorMetrics._resetForTests();
    jest.spyOn(operatorDnsHealth, 'getOperatorDnsHealth').mockResolvedValue({
      return_path_mx: 1,
      return_path_spf: 1,
      helo_a: 1,
      checkedAt: Date.now(),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('customer scrape accepted matches Redis value operator refresh reads (Review Focus)', async () => {
    const accountId = 'acct-op-1';
    const domain = 'mail.example.com';
    await redisService.client.set(
      `${META_PREFIX}${domain}`,
      JSON.stringify({
        accountId,
        domain,
        state: 'verified',
        suspended: false,
        dailyLimit: 100,
      })
    );
    await redisService.client.sadd('outbound:domains:index', domain);
    await redisService.client.sadd(`outbound:account:${accountId}:domains`, domain);
    await store.incrAccepted(domain);
    await store.incrAccepted(domain);
    await store.incrAccepted(domain);

    const setCalls = [];
    const OriginalGauge = promClient.Gauge;
    promClient.Gauge = class TrackingGauge extends OriginalGauge {
      constructor(...args) {
        super(...args);
        const inner = this.set;
        this.set = (...setArgs) => {
          setCalls.push(setArgs);
          return inner.apply(this, setArgs);
        };
      }
    };

    try {
      operatorMetrics._resetForTests();
      await operatorMetrics.refresh();
    } finally {
      promClient.Gauge = OriginalGauge;
    }

    const customerValue = await operatorMetrics.customerAcceptedLine(accountId, domain);
    expect(customerValue).toBe(3);

    expect(setCalls).toEqual(
      expect.arrayContaining([[{ domain, account: accountId }, 3]])
    );
    expect(operatorDnsHealth.getOperatorDnsHealth).toHaveBeenCalled();
  });

  it('sets dns_check_total and operator_dns_ok gauges', async () => {
    const accountId = 'acct-op-2';
    const domain = 'dns.example.com';
    await redisService.client.set(
      `${META_PREFIX}${domain}`,
      JSON.stringify({
        accountId,
        domain,
        state: 'verified',
        suspended: false,
        dailyLimit: null,
      })
    );
    await redisService.client.sadd('outbound:domains:index', domain);
    await store.incrDnsOutcome(domain, 'no_answer');

    const setCalls = [];
    const OriginalGauge = promClient.Gauge;
    promClient.Gauge = class TrackingGauge extends OriginalGauge {
      constructor(...args) {
        super(...args);
        const inner = this.set;
        this.set = (...setArgs) => {
          setCalls.push(setArgs);
          return inner.apply(this, setArgs);
        };
      }
    };

    try {
      operatorMetrics._resetForTests();
      await operatorMetrics.refresh();
    } finally {
      promClient.Gauge = OriginalGauge;
    }

    expect(setCalls).toEqual(
      expect.arrayContaining([
        [{ domain, outcome: 'no_answer', account: accountId }, 1],
        [{ check: 'return_path_mx' }, 1],
        [{ check: 'return_path_spf' }, 1],
        [{ check: 'helo_a' }, 1],
      ])
    );
  });
});
