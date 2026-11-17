process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.OUTBOUND_KEY_ENCRYPTION_SECRET = 'test-secret-for-outbound-domain-keys';

const express = require('express');
const request = require('supertest');
const redisService = require('../../../services/redisService');
const accountService = require('../../../services/outbound/accountService');
const suppressionsRoutes = require('../../../routes/outbound/suppressions');

const app = express();
app.use(express.json());
app.use('/api/outbound/suppressions', suppressionsRoutes);

describe('Outbound Suppressions HTTP', () => {
  beforeEach(() => {
    redisService.client.data = {};
  });

  it('lists, adds, exports, and deletes suppressions with a licence key', async () => {
    const account = await accountService.createAccount({ label: 'Acme', days: 30 });

    await request(app)
      .post('/api/outbound/suppressions')
      .set('X-License-Key', account.key)
      .send({ email: 'bad@example.org', reason: 'manual' })
      .expect(201);

    const list = await request(app)
      .get('/api/outbound/suppressions')
      .set('X-License-Key', account.key)
      .expect(200);
    expect(list.body.suppressions).toEqual([
      expect.objectContaining({ email: 'bad@example.org', reason: 'manual' }),
    ]);

    const csv = await request(app)
      .get('/api/outbound/suppressions/export')
      .set('X-License-Key', account.key)
      .expect(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text.split('\n')[0]).toBe('email,reason,added_at');
    expect(csv.text).toContain('bad@example.org,manual,');

    await request(app)
      .delete('/api/outbound/suppressions/bad@example.org')
      .set('X-License-Key', account.key)
      .expect(200);

    const after = await request(app)
      .get('/api/outbound/suppressions')
      .set('X-License-Key', account.key)
      .expect(200);
    expect(after.body.suppressions).toEqual([]);
  });
});
