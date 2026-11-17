process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.OUTBOUND_KEY_ENCRYPTION_SECRET = 'test-secret-for-outbound-domain-keys';

const express = require('express');
const request = require('supertest');
const redisService = require('../../../services/redisService');
const licenseService = require('../../../services/licenseService');
const accountService = require('../../../services/outbound/accountService');
const sendKeysRoutes = require('../../../routes/outbound/sendKeys');

const app = express();
app.use(express.json());
app.use('/api/outbound/send-keys', sendKeysRoutes);

const createOutboundAccount = (days = 30) => accountService.createAccount({ label: 'Acme', days });

describe('Outbound Send Keys HTTP', () => {
  beforeEach(() => {
    redisService.client.data = {};
  });

  describe('POST /api/outbound/send-keys', () => {
    it('issues a send key for the licence holder', async () => {
      const account = await createOutboundAccount();

      const res = await request(app)
        .post('/api/outbound/send-keys')
        .set('X-License-Key', account.key)
        .send({ name: 'prod' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.key).toMatch(/^hm_send_[0-9a-f]{48}$/);
      expect(res.body.name).toBe('prod');
    });

    it('returns 400 when name is missing', async () => {
      const account = await createOutboundAccount();

      const res = await request(app)
        .post('/api/outbound/send-keys')
        .set('X-License-Key', account.key)
        .send({})
        .expect(400);

      expect(res.body.code).toBe('NAME_REQUIRED');
    });

    it('returns 409 when the name is already used by this account', async () => {
      const account = await createOutboundAccount();
      await request(app).post('/api/outbound/send-keys').set('X-License-Key', account.key).send({ name: 'prod' }).expect(201);

      const res = await request(app)
        .post('/api/outbound/send-keys')
        .set('X-License-Key', account.key)
        .send({ name: 'prod' })
        .expect(409);

      expect(res.body.code).toBe('NAME_TAKEN');
    });

    it('returns 400 for a non-string name', async () => {
      const account = await createOutboundAccount();

      const res = await request(app)
        .post('/api/outbound/send-keys')
        .set('X-License-Key', account.key)
        .send({ name: 123 })
        .expect(400);

      expect(res.body.code).toBe('INVALID_NAME');
    });

    it('returns 400 for a name over the length cap', async () => {
      const account = await createOutboundAccount();

      const res = await request(app)
        .post('/api/outbound/send-keys')
        .set('X-License-Key', account.key)
        .send({ name: 'x'.repeat(101) })
        .expect(400);

      expect(res.body.code).toBe('INVALID_NAME');
    });
  });

  describe('GET /api/outbound/send-keys', () => {
    it('lists only the calling account\'s send keys, masked', async () => {
      const account = await createOutboundAccount();
      await request(app).post('/api/outbound/send-keys').set('X-License-Key', account.key).send({ name: 'prod' }).expect(201);

      const res = await request(app)
        .get('/api/outbound/send-keys')
        .set('X-License-Key', account.key)
        .expect(200);

      expect(res.body.sendKeys).toHaveLength(1);
      expect(res.body.sendKeys[0].name).toBe('prod');
      expect(res.body.sendKeys[0].maskedKey).toMatch(/^\*{4}[0-9a-f]{4}$/);
    });
  });

  describe('DELETE /api/outbound/send-keys/:name', () => {
    it('revokes a send key owned by the caller', async () => {
      const account = await createOutboundAccount();
      await request(app).post('/api/outbound/send-keys').set('X-License-Key', account.key).send({ name: 'prod' }).expect(201);

      await request(app)
        .delete('/api/outbound/send-keys/prod')
        .set('X-License-Key', account.key)
        .expect(200);

      const res = await request(app).get('/api/outbound/send-keys').set('X-License-Key', account.key).expect(200);
      expect(res.body.sendKeys).toEqual([]);
    });

    it('returns 404 for a send key name that does not exist', async () => {
      const account = await createOutboundAccount();

      const res = await request(app)
        .delete('/api/outbound/send-keys/nope')
        .set('X-License-Key', account.key)
        .expect(404);

      expect(res.body.code).toBe('NOT_FOUND');
    });
  });

  describe('auth', () => {
    it('rejects a licence key of the wrong type with 403', async () => {
      const senderLicense = await licenseService.createLicense({
        type: 'sender',
        plan: 'monthly',
        orderReference: 'sender-o1',
        ttlSeconds: 86400,
      });

      const res = await request(app)
        .get('/api/outbound/send-keys')
        .set('X-License-Key', senderLicense.key)
        .expect(403);

      expect(res.body.code).toBe('OUTBOUND_LICENSE_REQUIRED');
    });

    it('rejects a request with no licence key with 401', async () => {
      const res = await request(app).get('/api/outbound/send-keys').expect(401);

      expect(res.body.code).toBe('LICENSE_KEY_REQUIRED');
    });
  });
});
