process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.OUTBOUND_KEY_ENCRYPTION_SECRET = 'test-secret-for-outbound-domain-keys';

const redisService = require('../../../services/redisService');
const store = require('../../../services/outbound/outboundMetricsStore');
const renderer = require('../../../services/outbound/outboundMetricsRenderer');
const suppressionService = require('../../../services/outbound/suppressionService');

const META_PREFIX = 'outbound:domain:meta:';
const ACCOUNT_DOMAINS = (accountId) => `outbound:account:${accountId}:domains`;

const seedDomain = async ({ accountId, domain, dailyLimit, state }) => {
  await redisService.client.set(
    `${META_PREFIX}${domain}`,
    JSON.stringify({
      accountId,
      domain,
      state,
      suspended: false,
      dailyLimit,
      selector: 's1',
      privateKeyEnc: 'x',
      publicKeyPem: 'y',
      records: [],
    })
  );
  await redisService.client.sadd(ACCOUNT_DOMAINS(accountId), domain);
};

describe('outboundMetricsRenderer', () => {
  beforeEach(() => {
    redisService.client.data = {};
  });

  it('renders §5.8 series from Redis and survives a fresh render (redeploy pin)', async () => {
    const accountId = 'acct-a';
    const domain = 'mail.example.com';
    await seedDomain({ accountId, domain, dailyLimit: 1000, state: 'verified' });

    for (let i = 0; i < 5; i += 1) {
      await store.incrAccepted(domain);
    }
    for (let i = 0; i < 3; i += 1) {
      await store.incrDelivered(domain, `d-${i}`);
    }
    await store.incrBounced(domain, 'b-1', 'unknown_recipient');
    await store.incrRejected(domain, 'suppressed');
    await store.incrRejected(domain, 'suppressed');

    // leave queued at 1 (5 accepted - 3 delivered - 1 bounced)
    await redisService.client.set(`outbound:cap:${domain}:${utcStamp()}`, '5');
    await suppressionService.addSuppression({
      accountId,
      email: 'a@ex.org',
      reason: 'hard_bounce',
    });
    await suppressionService.addSuppression({
      accountId,
      email: 'b@ex.org',
      reason: 'hard_bounce',
    });

    const text1 = await renderer.renderAccount({ accountId });
    // Simulate new process: require again is same module, but values come from Redis
    const text2 = await renderer.renderAccount({ accountId });

    expect(text1).toEqual(text2);
    expect(text1).toMatch(/hidemail_outbound_accepted_total\{domain="mail\.example\.com"\} 5/);
    expect(text1).toMatch(/hidemail_outbound_delivered_total\{domain="mail\.example\.com"\} 3/);
    expect(text1).toMatch(
      /hidemail_outbound_bounced_total\{domain="mail\.example\.com",category="unknown_recipient"\} 1/
    );
    expect(text1).toMatch(
      /hidemail_outbound_rejected_total\{domain="mail\.example\.com",reason="suppressed"\} 2/
    );
    expect(text1).toMatch(/hidemail_outbound_queued\{domain="mail\.example\.com"\} 1/);
    expect(text1).toMatch(/hidemail_outbound_daily_sent\{domain="mail\.example\.com"\} 5/);
    expect(text1).toMatch(/hidemail_outbound_daily_limit\{domain="mail\.example\.com"\} 1000/);
    expect(text1).toMatch(/hidemail_outbound_domain_verified\{domain="mail\.example\.com"\} 1/);
    expect(text1).toMatch(/hidemail_outbound_suppressions\{reason="hard_bounce"\} 2/);
    expect(text1).not.toMatch(/account=/);
  });

  it('emits +Inf daily_limit for uncapped domains', async () => {
    const accountId = 'acct-u';
    const domain = 'uncapped.example.com';
    await seedDomain({ accountId, domain, dailyLimit: null, state: 'verified' });
    const text = await renderer.renderAccount({ accountId });
    expect(text).toMatch(/hidemail_outbound_daily_limit\{domain="uncapped\.example\.com"\} \+Inf/);
  });

  it('adds account label when requested', async () => {
    const accountId = 'acct-op';
    const domain = 'op.example.com';
    await seedDomain({ accountId, domain, dailyLimit: 10, state: 'pending' });
    await store.incrAccepted(domain);
    const text = await renderer.renderAccount({ accountId, accountLabel: true });
    expect(text).toMatch(
      /hidemail_outbound_accepted_total\{account="acct-op",domain="op\.example\.com"\} 1/
    );
    expect(text).toMatch(/hidemail_outbound_domain_verified\{account="acct-op",domain="op\.example\.com"\} 0/);
  });
});

function utcStamp(date = new Date()) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}
