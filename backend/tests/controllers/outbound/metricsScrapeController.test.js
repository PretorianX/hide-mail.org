process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.OUTBOUND_KEY_ENCRYPTION_SECRET = 'test-secret-for-outbound-domain-keys';
process.env.OUTBOUND_RETURN_PATH_TARGET = 'rp.hide-mail.org';

const express = require('express');
const request = require('supertest');

const outboundRoutes = require('../../../routes/outbound');
const accountService = require('../../../services/outbound/accountService');
const metricsTokenService = require('../../../services/outbound/metricsTokenService');
const sendKeyService = require('../../../services/outbound/sendKeyService');
const store = require('../../../services/outbound/outboundMetricsStore');
const redisService = require('../../../services/redisService');

const META_PREFIX = 'outbound:domain:meta:';
const accountDomainsKey = (accountId) => `outbound:account:${accountId}:domains`;

const app = express();
app.use(express.json());
app.use('/api/outbound', outboundRoutes);

const seedDomain = async ({ accountId, domain }) => {
  await redisService.client.set(
    `${META_PREFIX}${domain}`,
    JSON.stringify({
      accountId,
      domain,
      state: 'verified',
      suspended: false,
      dailyLimit: 100,
      selector: 's1',
      privateKeyEnc: 'x',
      publicKeyPem: 'y',
      records: [],
    })
  );
  await redisService.client.sadd(accountDomainsKey(accountId), domain);
  await redisService.client.sadd('outbound:domains:index', domain);
};

describe('GET /api/outbound/metrics', () => {
  beforeEach(() => {
    redisService.client.data = {};
  });

  it('returns Prometheus text for the token account only (cross-account isolation)', async () => {
    const a = await accountService.createAccount({ label: 'A', days: 30 });
    const b = await accountService.createAccount({ label: 'B', days: 30 });
    await seedDomain({ accountId: a.accountId, domain: 'a.example.com' });
    await seedDomain({ accountId: b.accountId, domain: 'b.example.com' });
    await store.incrAccepted('a.example.com');
    await store.incrAccepted('b.example.com');

    const { key } = await metricsTokenService.rotateMetricsToken({ accountId: a.accountId });

    const res = await request(app)
      .get('/api/outbound/metrics')
      .set('Authorization', `Bearer ${key}`)
      .expect(200);

    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('hidemail_outbound_accepted_total{domain="a.example.com"} 1');
    expect(res.text).not.toContain('b.example.com');
    expect(res.text).not.toContain('account=');
  });

  it('rejects a send key (Review Focus)', async () => {
    const account = await accountService.createAccount({ label: 'A', days: 30 });
    const { key } = await sendKeyService.createSendKey({ accountId: account.accountId, name: 'prod' });

    await request(app)
      .get('/api/outbound/metrics')
      .set('Authorization', `Bearer ${key}`)
      .expect(401);
  });
});
