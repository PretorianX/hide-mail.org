process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.OUTBOUND_KEY_ENCRYPTION_SECRET = 'test-secret-for-outbound-domain-keys';

jest.mock('../../../services/outbound/domainVerifier');

const express = require('express');
const request = require('supertest');
const redisService = require('../../../services/redisService');
const licenseService = require('../../../services/licenseService');
const accountService = require('../../../services/outbound/accountService');
const { verifyDomain } = require('../../../services/outbound/domainVerifier');
const domainsRoutes = require('../../../routes/outbound/domains');

const app = express();
app.use(express.json());
app.use('/api/outbound/domains', domainsRoutes);

const createOutboundAccount = (days = 30) => accountService.createAccount({ label: 'Acme', days });

describe('Outbound Domains HTTP', () => {
  beforeEach(() => {
    redisService.client.data = {};
    jest.clearAllMocks();
  });

  describe('POST /api/outbound/domains', () => {
    it('adds a domain for the licence holder and returns pending with three records', async () => {
      const account = await createOutboundAccount();

      const res = await request(app)
        .post('/api/outbound/domains')
        .set('X-License-Key', account.key)
        .send({ domain: 'example.com' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.domain).toBe('example.com');
      expect(res.body.state).toBe('pending');
      expect(res.body.records).toHaveLength(4);
    });

    it('returns 409 DOMAIN_TAKEN for a domain already claimed by another account', async () => {
      const first = await createOutboundAccount();
      const second = await createOutboundAccount();
      await request(app).post('/api/outbound/domains').set('X-License-Key', first.key).send({ domain: 'example.com' }).expect(201);

      const res = await request(app)
        .post('/api/outbound/domains')
        .set('X-License-Key', second.key)
        .send({ domain: 'example.com' })
        .expect(409);

      expect(res.body.code).toBe('DOMAIN_TAKEN');
    });

    it('returns 400 when domain is missing', async () => {
      const account = await createOutboundAccount();

      const res = await request(app)
        .post('/api/outbound/domains')
        .set('X-License-Key', account.key)
        .send({})
        .expect(400);

      expect(res.body.code).toBe('DOMAIN_REQUIRED');
    });

    it('returns 503 with a string error when encryption secret is not configured', async () => {
      const domainService = require('../../../services/outbound/domainService');
      const spy = jest.spyOn(domainService, 'addDomain').mockRejectedValue(
        new Error(
          'Outbound key encryption not configured. Set OUTBOUND_KEY_ENCRYPTION_SECRET environment variable.'
        )
      );
      const account = await createOutboundAccount();

      try {
        const res = await request(app)
          .post('/api/outbound/domains')
          .set('X-License-Key', account.key)
          .send({ domain: 'example.com' })
          .expect(503);

        expect(res.body.success).toBe(false);
        expect(res.body.code).toBe('OUTBOUND_NOT_CONFIGURED');
        expect(typeof res.body.error).toBe('string');
        expect(res.body.error).toContain('OUTBOUND_KEY_ENCRYPTION_SECRET');
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('GET /api/outbound/domains', () => {
    it('lists only the calling account domains', async () => {
      const account = await createOutboundAccount();
      await request(app).post('/api/outbound/domains').set('X-License-Key', account.key).send({ domain: 'example.com' }).expect(201);

      const res = await request(app)
        .get('/api/outbound/domains')
        .set('X-License-Key', account.key)
        .expect(200);

      expect(res.body.domains).toEqual([
        expect.objectContaining({
          domain: 'example.com',
          state: 'pending',
          suspended: false,
          dailyLimit: null,
          selector: expect.stringMatching(/^hm-/),
          records: expect.any(Array),
          lastCheckedAt: null,
        }),
      ]);
      expect(res.body.domains[0].records.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/outbound/domains/:domain/check', () => {
    it('reverifies DNS and returns the updated state', async () => {
      const account = await createOutboundAccount();
      await request(app).post('/api/outbound/domains').set('X-License-Key', account.key).send({ domain: 'example.com' }).expect(201);

      verifyDomain.mockResolvedValue({
        state: 'verified',
        records: [{ id: 'dkim', status: 'pass', reason: null, nameserverAnswers: [] }],
      });

      const res = await request(app)
        .post('/api/outbound/domains/example.com/check')
        .set('X-License-Key', account.key)
        .expect(200);

      expect(res.body.state).toBe('verified');
    });

    it('returns 404 for a domain that does not belong to the caller', async () => {
      const owner = await createOutboundAccount();
      const other = await createOutboundAccount();
      await request(app).post('/api/outbound/domains').set('X-License-Key', owner.key).send({ domain: 'example.com' }).expect(201);

      const res = await request(app)
        .post('/api/outbound/domains/example.com/check')
        .set('X-License-Key', other.key)
        .expect(404);

      expect(res.body.code).toBe('NOT_FOUND');
    });
  });

  describe('DELETE /api/outbound/domains/:domain', () => {
    it('removes a domain owned by the caller', async () => {
      const account = await createOutboundAccount();
      await request(app).post('/api/outbound/domains').set('X-License-Key', account.key).send({ domain: 'example.com' }).expect(201);

      await request(app)
        .delete('/api/outbound/domains/example.com')
        .set('X-License-Key', account.key)
        .expect(200);

      const res = await request(app).get('/api/outbound/domains').set('X-License-Key', account.key).expect(200);
      expect(res.body.domains).toEqual([]);
    });

    it('returns 404 when removing a domain the caller does not own', async () => {
      const owner = await createOutboundAccount();
      const other = await createOutboundAccount();
      await request(app).post('/api/outbound/domains').set('X-License-Key', owner.key).send({ domain: 'example.com' }).expect(201);

      const res = await request(app)
        .delete('/api/outbound/domains/example.com')
        .set('X-License-Key', other.key)
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
        .get('/api/outbound/domains')
        .set('X-License-Key', senderLicense.key)
        .expect(403);

      expect(res.body.code).toBe('OUTBOUND_LICENSE_REQUIRED');
    });

    it('rejects a request with no licence key with 401', async () => {
      const res = await request(app).get('/api/outbound/domains').expect(401);

      expect(res.body.code).toBe('LICENSE_KEY_REQUIRED');
    });
  });
});
