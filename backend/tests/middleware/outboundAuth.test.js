process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.OUTBOUND_KEY_ENCRYPTION_SECRET = 'test-secret-for-outbound-domain-keys';

const express = require('express');
const request = require('supertest');

const { requireSendKey } = require('../../middleware/outboundAuth');
const accountService = require('../../services/outbound/accountService');
const sendKeyService = require('../../services/outbound/sendKeyService');
const licenseService = require('../../services/licenseService');
const redisService = require('../../services/redisService');

const app = express();
app.get('/protected', requireSendKey, (req, res) => {
  res.status(200).json({ success: true, accountId: req.accountId });
});

const createOutboundAccount = (days = 30) => accountService.createAccount({ label: 'Acme', days });

describe('requireSendKey middleware', () => {
  beforeEach(() => {
    redisService.client.data = {};
  });

  it('calls next() with req.accountId set for a valid key and an active account licence', async () => {
    const account = await createOutboundAccount();
    const { key } = await sendKeyService.createSendKey({ accountId: account.accountId, name: 'prod' });

    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${key}`)
      .expect(200);

    expect(res.body.accountId).toBe(account.accountId);
  });

  it('returns 403 when the owning account\'s licence has since expired', async () => {
    const account = await createOutboundAccount();
    const { key } = await sendKeyService.createSendKey({ accountId: account.accountId, name: 'prod' });
    await licenseService.revokeLicense(account.key);

    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${key}`)
      .expect(403);

    expect(res.body.success).toBe(false);
  });

  it('returns 401 for a missing Authorization header', async () => {
    const res = await request(app).get('/protected').expect(401);

    expect(res.body.code).toBe('SEND_KEY_REQUIRED');
  });

  it('returns 401 for a garbage Authorization header', async () => {
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer not-a-real-key')
      .expect(401);

    expect(res.body.code).toBe('SEND_KEY_INVALID');
  });

  it('returns 401 for an X-License-Key header alone, with no Bearer send key', async () => {
    const account = await createOutboundAccount();

    const res = await request(app)
      .get('/protected')
      .set('X-License-Key', account.key)
      .expect(401);

    expect(res.body.code).toBe('SEND_KEY_REQUIRED');
  });
});
