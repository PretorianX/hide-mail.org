process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.BOUNCE_PRICE_MONTHLY_USD = '18';
process.env.CHECKOUT_PAUSED = 'true';

const express = require('express');
const request = require('supertest');
const redisService = require('../../services/redisService');
const licenseService = require('../../services/licenseService');
const { browser, api } = require('../../routes/bounceRead');
const mailGradeRoutes = require('../../routes/mailGrade');
const qaApiRoutes = require('../../routes/qaApi');

const BOUNCE = [
  'Final-Recipient: rfc822; ada@example.com',
  'Action: failed',
  'Status: 5.1.1',
  'Diagnostic-Code: smtp; 550 5.1.1 user unknown',
].join('\n');

const app = express();
app.use(express.json({ limit: '200kb' }));
app.use('/bounces', browser);
app.use('/bounce-read', api);
app.use('/mail-grade', mailGradeRoutes.api);
app.use('/qa', qaApiRoutes);

describe('Bounce Read HTTP', () => {
  beforeEach(() => {
    redisService.client.data = {};
  });

  it('publishes the Bounce Read API price separately from Pro', async () => {
    const res = await request(app).get('/bounces/offer').expect(200);

    expect(res.body.offer).toEqual({
      name: 'Bounce Read API',
      type: 'bounce',
      plan: 'monthly',
      usd: 18,
      checkoutPaused: true,
      endpoint: 'POST /api/bounce-read',
    });
  });

  it('reads a pasted bounce on the free report route', async () => {
    const res = await request(app)
      .post('/bounces/report')
      .send({ source: BOUNCE })
      .expect(200);

    expect(res.body.report.stored).toBe(false);
    expect(res.body.report.verdict).toBe('hard');
    expect(res.body.report.recipients[0].recipient).toBe('ada@example.com');
  });

  it('returns a client error when the paste is not a bounce', async () => {
    const res = await request(app)
      .post('/bounces/report')
      .send({ source: 'not a bounce' })
      .expect(400);

    expect(res.body.code).toBe('NOT_A_BOUNCE');
  });

  it('returns a client error for an empty paste', async () => {
    const res = await request(app)
      .post('/bounces/report')
      .send({ source: '  ' })
      .expect(400);

    expect(res.body.code).toBe('EMPTY_BOUNCE');
  });

  describe('paid API', () => {
    const issue = async (type) => {
      const license = await licenseService.createLicense({
        type,
        plan: 'monthly',
        orderReference: `${type}-monthly-bounce-test`,
        ttlSeconds: 3600,
      });
      return licenseService.createApiKey(license.key);
    };

    it('reads a bounce for a Bounce Read key and rejects QA and Mail Grade keys', async () => {
      const bounceKey = await issue('bounce');
      const qaKey = await issue('api');
      const gradeKey = await issue('grade');

      const read = await request(app)
        .post('/bounce-read')
        .set('Authorization', `Bearer ${bounceKey}`)
        .send({ source: BOUNCE })
        .expect(200);

      expect(read.body.report.verdict).toBe('hard');

      const qaRejected = await request(app)
        .post('/bounce-read')
        .set('Authorization', `Bearer ${qaKey}`)
        .send({ source: BOUNCE })
        .expect(403);
      expect(qaRejected.body.code).toBe('BOUNCE_PLAN_REQUIRED');

      const gradeRejected = await request(app)
        .post('/bounce-read')
        .set('Authorization', `Bearer ${gradeKey}`)
        .send({ source: BOUNCE })
        .expect(403);
      expect(gradeRejected.body.code).toBe('BOUNCE_PLAN_REQUIRED');
    });

    it('rejects a missing key', async () => {
      const res = await request(app).post('/bounce-read').send({ source: BOUNCE }).expect(401);
      expect(res.body.code).toBe('API_KEY_REQUIRED');
    });

    it('does not let a Bounce Read key open the QA mailbox API or Mail Grade', async () => {
      const bounceKey = await issue('bounce');

      const qa = await request(app)
        .post('/qa/mailboxes')
        .set('Authorization', `Bearer ${bounceKey}`)
        .send({})
        .expect(403);
      expect(qa.body.code).toBe('QA_PLAN_REQUIRED');

      const grade = await request(app)
        .post('/mail-grade')
        .set('Authorization', `Bearer ${bounceKey}`)
        .send({ source: 'From: a@b.c\nSubject: Hi\n\nHi' })
        .expect(403);
      expect(grade.body.code).toBe('GRADE_PLAN_REQUIRED');
    });
  });
});
