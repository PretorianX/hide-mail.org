process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.OUTBOUND_KEY_ENCRYPTION_SECRET = 'test-secret-for-outbound-domain-keys';

const express = require('express');
const request = require('supertest');
const redisService = require('../../../services/redisService');
const accountService = require('../../../services/outbound/accountService');
const messageStore = require('../../../services/outbound/messageStore');
const activityRoutes = require('../../../routes/outbound/activity');

const app = express();
app.use(express.json());
app.use('/api/outbound/activity', activityRoutes);

describe('Outbound Activity HTTP', () => {
  beforeEach(() => {
    redisService.client.data = {};
  });

  it('returns 401 without a licence key', async () => {
    await request(app).get('/api/outbound/activity').expect(401);
  });

  it('lists recent messages for the account newest first', async () => {
    const account = await accountService.createAccount({ label: 'Acme', days: 30 });
    await messageStore.createMessage({
      id: 'm1',
      accountId: account.accountId,
      domain: 'mail.example.com',
      recipient: 'a@example.org',
      reference: null,
    });
    await messageStore.updateStatus({
      id: 'm1',
      status: 'bounced',
      response: '550 5.1.1 user unknown',
    });

    const res = await request(app)
      .get('/api/outbound/activity')
      .set('X-License-Key', account.key)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.messages).toHaveLength(1);
    expect(res.body.messages[0]).toMatchObject({
      id: 'm1',
      status: 'bounced',
      lastResponse: '550 5.1.1 user unknown',
    });
  });
});
