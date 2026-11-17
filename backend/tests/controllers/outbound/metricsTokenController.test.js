process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.OUTBOUND_KEY_ENCRYPTION_SECRET = 'test-secret-for-outbound-domain-keys';

const express = require('express');
const request = require('supertest');

const metricsTokenRoutes = require('../../../routes/outbound/metricsToken');
const accountService = require('../../../services/outbound/accountService');
const redisService = require('../../../services/redisService');

const app = express();
app.use(express.json());
app.use('/api/outbound/metrics-token', metricsTokenRoutes);

describe('outbound metrics-token controller', () => {
  beforeEach(() => {
    redisService.client.data = {};
  });

  it('POST issues a token and GET returns metadata', async () => {
    const account = await accountService.createAccount({ label: 'Acme', days: 30 });

    const created = await request(app)
      .post('/api/outbound/metrics-token')
      .set('X-License-Key', account.key)
      .expect(201);

    expect(created.body.key).toMatch(/^hm_metrics_/);
    expect(created.body.scrapeConfig.job_name).toBe('hidemail-outbound');

    const meta = await request(app)
      .get('/api/outbound/metrics-token')
      .set('X-License-Key', account.key)
      .expect(200);

    expect(meta.body.tokenPresent).toBe(true);
    expect(meta.body.key).toBeUndefined();
  });

  it('GET 404 when no token exists yet', async () => {
    const account = await accountService.createAccount({ label: 'Acme', days: 30 });
    await request(app)
      .get('/api/outbound/metrics-token')
      .set('X-License-Key', account.key)
      .expect(404);
  });
});
