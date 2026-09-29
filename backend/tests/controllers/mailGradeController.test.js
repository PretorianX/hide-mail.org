process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.GRADE_PRICE_MONTHLY_USD = '9';
process.env.CHECKOUT_PAUSED = 'true';

const express = require('express');
const request = require('supertest');
const redisService = require('../../services/redisService');
const licenseService = require('../../services/licenseService');
const { browser, api } = require('../../routes/mailGrade');
const qaApiRoutes = require('../../routes/qaApi');

const SOURCE = [
  'From: Ada <ada@example.com>',
  'To: you@example.com',
  'Subject: Hello',
  'Date: Tue, 1 Mar 2026 12:00:00 +0000',
  'Message-ID: <hi@example.com>',
  '',
  'A short note with https://example.com/hello',
  '',
].join('\r\n');

const app = express();
app.use(express.json({ limit: '200kb' }));
app.use('/grade', browser);
app.use('/mail-grade', api);
app.use('/qa', qaApiRoutes);

describe('Mail Grade HTTP', () => {
  beforeEach(() => {
    redisService.client.data = {};
  });

  it('publishes the Mail Grade API price separately from Pro', async () => {
    const res = await request(app).get('/grade/offer').expect(200);

    expect(res.body.offer).toEqual({
      name: 'Mail Grade API',
      type: 'grade',
      plan: 'monthly',
      usd: 9,
      checkoutPaused: true,
      endpoint: 'POST /api/mail-grade',
    });
  });

  it('grades a pasted email on the free report route', async () => {
    const res = await request(app)
      .post('/grade/report')
      .send({ source: SOURCE })
      .expect(200);

    expect(res.body.report.stored).toBe(false);
    expect(res.body.report.grade).toMatch(/^[A-F]$/);
    expect(res.body.report.findings.length).toBeGreaterThan(0);
  });

  it('returns a client error when the paste is not an email', async () => {
    const res = await request(app)
      .post('/grade/report')
      .send({ source: 'not an email' })
      .expect(400);

    expect(res.body.code).toBe('NOT_AN_EMAIL');
  });

  it('returns a client error for an empty paste', async () => {
    const res = await request(app)
      .post('/grade/report')
      .send({ source: '  ' })
      .expect(400);

    expect(res.body.code).toBe('EMPTY_EMAIL');
  });

  describe('paid API', () => {
    const issue = async (type) => {
      const license = await licenseService.createLicense({
        type,
        plan: 'monthly',
        orderReference: `${type}-monthly-grade-test`,
        ttlSeconds: 3600,
      });
      return licenseService.createApiKey(license.key);
    };

    it('scores mail for a Mail Grade key and rejects a QA mailbox key', async () => {
      const gradeKey = await issue('grade');
      const qaKey = await issue('api');

      const graded = await request(app)
        .post('/mail-grade')
        .set('Authorization', `Bearer ${gradeKey}`)
        .send({ source: SOURCE })
        .expect(200);

      expect(graded.body.report.grade).toMatch(/^[A-F]$/);

      const rejected = await request(app)
        .post('/mail-grade')
        .set('Authorization', `Bearer ${qaKey}`)
        .send({ source: SOURCE })
        .expect(403);

      expect(rejected.body.code).toBe('GRADE_PLAN_REQUIRED');
    });

    it('rejects a missing key', async () => {
      const res = await request(app).post('/mail-grade').send({ source: SOURCE }).expect(401);
      expect(res.body.code).toBe('API_KEY_REQUIRED');
    });

    it('does not let a Mail Grade key open the QA mailbox API', async () => {
      const gradeKey = await issue('grade');

      const res = await request(app)
        .post('/qa/mailboxes')
        .set('Authorization', `Bearer ${gradeKey}`)
        .send({})
        .expect(403);

      expect(res.body.code).toBe('QA_PLAN_REQUIRED');
    });
  });
});
