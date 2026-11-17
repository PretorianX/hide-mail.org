process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.OUTBOUND_KEY_ENCRYPTION_SECRET = 'test-secret-for-outbound-domain-keys';

const express = require('express');
const request = require('supertest');

const { requireMetricsToken, requireSendKey } = require('../../middleware/outboundAuth');
const accountService = require('../../services/outbound/accountService');
const sendKeyService = require('../../services/outbound/sendKeyService');
const metricsTokenService = require('../../services/outbound/metricsTokenService');
const redisService = require('../../services/redisService');

const app = express();
app.get('/metrics', requireMetricsToken, (req, res) => {
  res.status(200).json({ accountId: req.accountId });
});
app.post('/messages', requireSendKey, (req, res) => {
  res.status(202).json({ ok: true });
});

describe('requireMetricsToken / credential cross-use (Review Focus)', () => {
  beforeEach(() => {
    redisService.client.data = {};
  });

  it('accepts a valid metrics token', async () => {
    const account = await accountService.createAccount({ label: 'Acme', days: 30 });
    const { key } = await metricsTokenService.rotateMetricsToken({ accountId: account.accountId });

    const res = await request(app)
      .get('/metrics')
      .set('Authorization', `Bearer ${key}`)
      .expect(200);

    expect(res.body.accountId).toBe(account.accountId);
  });

  it('rejects a send key on the metrics path', async () => {
    const account = await accountService.createAccount({ label: 'Acme', days: 30 });
    const { key } = await sendKeyService.createSendKey({ accountId: account.accountId, name: 'prod' });

    await request(app)
      .get('/metrics')
      .set('Authorization', `Bearer ${key}`)
      .expect(401);
  });

  it('rejects a metrics token on the send path', async () => {
    const account = await accountService.createAccount({ label: 'Acme', days: 30 });
    const { key } = await metricsTokenService.rotateMetricsToken({ accountId: account.accountId });

    await request(app)
      .post('/messages')
      .set('Authorization', `Bearer ${key}`)
      .expect(401);
  });

  it('rejects a licence key as Bearer on the metrics path', async () => {
    const account = await accountService.createAccount({ label: 'Acme', days: 30 });
    await request(app)
      .get('/metrics')
      .set('Authorization', `Bearer ${account.key}`)
      .expect(401);
  });
});
