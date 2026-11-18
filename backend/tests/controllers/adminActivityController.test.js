process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.OUTBOUND_KEY_ENCRYPTION_SECRET = 'test-secret-for-outbound-domain-keys';
process.env.ADMIN_EMAIL = 'ops@hide-mail.org';
process.env.ADMIN_PASSWORD = 's3cret-ops';
process.env.ADMIN_SESSION_SECRET = 'session-secret-for-tests';

const express = require('express');
const request = require('supertest');
const redisService = require('../../services/redisService');
const accountService = require('../../services/outbound/accountService');
const messageStore = require('../../services/outbound/messageStore');
const adminRoutes = require('../../routes/admin');

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

const loginCookie = async () => {
  const res = await request(app)
    .post('/api/admin/login')
    .send({ email: 'ops@hide-mail.org', password: 's3cret-ops' })
    .expect(200);
  return res.headers['set-cookie'];
};

describe('GET /api/admin/activity', () => {
  beforeEach(() => {
    redisService.client.data = {};
  });

  it('returns 401 without an admin session', async () => {
    await request(app).get('/api/admin/activity').expect(401);
  });

  it('lists cross-account activity for a signed-in admin', async () => {
    const account = await accountService.createAccount({ label: 'acme', days: 30 });
    await messageStore.createMessage({
      id: 'm1',
      accountId: account.accountId,
      domain: 'mail.example.com',
      recipient: 'to@example.org',
      subject: 'Hello',
      from: { name: 'Acme', email: 'noreply@mail.example.com' },
      envelopeFrom: 'b-m1@hm-bounce.mail.example.com',
      clientIp: '203.0.113.9',
      sendKeyName: 'prod',
    });
    await messageStore.updateStatus({
      id: 'm1',
      status: 'delivered',
      response: 'accepted by postfix',
    });

    const cookie = await loginCookie();
    const res = await request(app)
      .get('/api/admin/activity')
      .set('Cookie', cookie)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.messages).toHaveLength(1);
    expect(res.body.messages[0]).toMatchObject({
      id: 'm1',
      accountLabel: 'acme',
      subject: 'Hello',
      status: 'delivered',
      clientIp: '203.0.113.9',
      sendKeyName: 'prod',
    });
    expect(JSON.stringify(res.body)).not.toContain(account.key);
  });
});
