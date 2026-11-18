process.env.VALID_DOMAINS = 'hide-mail.org';

const express = require('express');
const request = require('supertest');
const redisService = require('../../services/redisService');
const apiRateLimiter = require('../../services/apiRateLimiter');

const { RATE_LIMITS } = apiRateLimiter;

const perMinute = ({ requests, windowSeconds }) => (requests / windowSeconds) * 60;

describe('apiRateLimiter limits', () => {
  beforeEach(() => {
    redisService.client.data = {};
    jest.restoreAllMocks();
  });

  it('throttles license key checks harder than ordinary endpoints', () => {
    expect(perMinute(RATE_LIMITS.licenseValidate))
      .toBeLessThan(perMinute(RATE_LIMITS.default));
  });

  it('throttles admin login harder than ordinary endpoints', () => {
    expect(perMinute(RATE_LIMITS.adminLogin))
      .toBeLessThan(perMinute(RATE_LIMITS.default));
    expect(RATE_LIMITS.adminLogin.failClosed).toBe(true);
  });

  it('keeps order lookups in a separate bucket from license key checks', () => {
    // Sharing a bucket would let key guessing lock a paying customer out of collecting
    // the key they just bought.
    expect(RATE_LIMITS.orderLookup).not.toBe(RATE_LIMITS.licenseValidate);
    expect(perMinute(RATE_LIMITS.orderLookup))
      .toBeGreaterThan(perMinute(RATE_LIMITS.licenseValidate));
  });

  it('does not yield fresh buckets when rotating X-Forwarded-For', async () => {
    const app = express();
    app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);
    app.post('/license/validate', apiRateLimiter.licenseValidate, (_req, res) => {
      res.status(404).json({ success: false });
    });

    const limit = RATE_LIMITS.licenseValidate.requests;
    for (let i = 0; i < limit; i++) {
      await request(app)
        .post('/license/validate')
        .set('X-Forwarded-For', `198.51.100.${i + 1}, 203.0.113.50`)
        .expect(404);
    }

    const blocked = await request(app)
      .post('/license/validate')
      .set('X-Forwarded-For', '198.51.100.250, 203.0.113.50')
      .expect(429);

    expect(blocked.body.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('enforces strict admin login limit with backoff and fails closed on Redis errors', async () => {
    const app = express();
    app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);
    app.use(express.json());
    app.post('/admin/login', apiRateLimiter.adminLogin, (_req, res) => {
      res.status(401).json({ success: false });
    });

    const limit = RATE_LIMITS.adminLogin.requests;
    for (let i = 0; i < limit; i++) {
      await request(app)
        .post('/admin/login')
        .set('X-Forwarded-For', `198.51.100.${i + 10}, 203.0.113.80`)
        .send({ email: 'ops@hide-mail.org', password: 'wrong' })
        .expect(401);
    }

    const blocked = await request(app)
      .post('/admin/login')
      .set('X-Forwarded-For', '198.51.100.99, 203.0.113.80')
      .send({ email: 'ops@hide-mail.org', password: 'wrong' })
      .expect(429);

    expect(blocked.body.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThanOrEqual(
      RATE_LIMITS.adminLogin.windowSeconds
    );

    jest.spyOn(redisService.client, 'incr').mockRejectedValueOnce(new Error('Redis down'));

    const unavailable = await request(app)
      .post('/admin/login')
      .send({ email: 'ops@hide-mail.org', password: 'wrong' })
      .expect(503);

    expect(unavailable.body.code).toBe('RATE_LIMIT_UNAVAILABLE');
  });

  it('still fails open for non-auth default limiter on Redis errors', async () => {
    const app = express();
    app.get('/public', apiRateLimiter.default, (_req, res) => {
      res.status(200).json({ ok: true });
    });

    jest.spyOn(redisService.client, 'incr').mockRejectedValueOnce(new Error('Redis down'));

    await request(app).get('/public').expect(200);
  });
});
