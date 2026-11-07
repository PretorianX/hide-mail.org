process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.ONECLICK_PRICE_MONTHLY_USD = '27';
process.env.CHECKOUT_PAUSED = 'true';

const express = require('express');
const request = require('supertest');
const redisService = require('../../services/redisService');
const licenseService = require('../../services/licenseService');
const { browser, api } = require('../../routes/oneClick');
const mailGradeRoutes = require('../../routes/mailGrade');
const qaApiRoutes = require('../../routes/qaApi');
const complaintReadRoutes = require('../../routes/complaintRead');

const SOURCE = [
  'From: News <news@sender.example>',
  'Subject: October',
  'List-Unsubscribe: <mailto:unsub@sender.example>, <https://sender.example/unsub/opaque>',
  'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
  '',
  'Hello',
].join('\n');

const app = express();
app.use(express.json({ limit: '200kb' }));
app.use('/one-click', browser);
app.use('/one-click-read', api);
app.use('/mail-grade', mailGradeRoutes.api);
app.use('/qa', qaApiRoutes);
app.use('/complaint-read', complaintReadRoutes.api);

describe('One-Click HTTP', () => {
  beforeEach(() => {
    redisService.client.data = {};
  });

  it('publishes the One-Click API price separately from Pro and Mail Grade', async () => {
    const res = await request(app).get('/one-click/offer').expect(200);

    expect(res.body.offer).toEqual({
      name: 'One-Click API',
      type: 'oneclick',
      plan: 'monthly',
      usd: 27,
      checkoutPaused: true,
      endpoint: 'POST /api/one-click-read',
    });
  });

  it('checks a pasted message on the free route and does not keep the source', async () => {
    const res = await request(app)
      .post('/one-click/report')
      .send({ source: `${SOURCE}\nsecret-original-body` })
      .expect(200);

    expect(res.body.report.stamp).toBe('PASS');
    expect(res.body.report.postUri).toBe('https://sender.example/unsub/opaque');
    expect(res.body.report.stored).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain('secret-original-body');
    expect(JSON.stringify(redisService.client.data)).not.toContain('sender.example');
  });

  it('returns a client error when the paste is not an email', async () => {
    const res = await request(app)
      .post('/one-click/report')
      .send({ source: 'Please unsubscribe me from this list.' })
      .expect(400);

    expect(res.body.code).toBe('NOT_AN_EMAIL');
  });

  it('returns a client error for an empty paste', async () => {
    const res = await request(app)
      .post('/one-click/report')
      .send({ source: '  ' })
      .expect(400);

    expect(res.body.code).toBe('EMPTY_ONECLICK');
  });

  it('returns 413 when the message is larger than 64 KB', async () => {
    const res = await request(app)
      .post('/one-click/report')
      .send({ source: `${'x'.repeat((64 * 1024) + 1)}` })
      .expect(413);

    expect(res.body.code).toBe('ONECLICK_TOO_LARGE');
  });

  describe('paid API', () => {
    const issue = async (type) => {
      const license = await licenseService.createLicense({
        type,
        plan: 'monthly',
        orderReference: `${type}-monthly-oneclick-test`,
        ttlSeconds: 3600,
      });
      return licenseService.createApiKey(license.key);
    };

    it('reads one-click for a One-Click key and a suite key, and rejects QA and Mail Grade keys', async () => {
      const oneClickKey = await issue('oneclick');
      const suiteKey = await issue('suite');
      const qaKey = await issue('api');
      const gradeKey = await issue('grade');

      const read = await request(app)
        .post('/one-click-read')
        .set('Authorization', `Bearer ${oneClickKey}`)
        .send({ source: SOURCE })
        .expect(200);
      expect(read.body.report.verdict).toBe('pass');

      const suite = await request(app)
        .post('/one-click-read')
        .set('Authorization', `Bearer ${suiteKey}`)
        .send({ source: SOURCE })
        .expect(200);
      expect(suite.body.report.stamp).toBe('PASS');

      const qaRejected = await request(app)
        .post('/one-click-read')
        .set('Authorization', `Bearer ${qaKey}`)
        .send({ source: SOURCE })
        .expect(403);
      expect(qaRejected.body.code).toBe('ONECLICK_PLAN_REQUIRED');

      const gradeRejected = await request(app)
        .post('/one-click-read')
        .set('Authorization', `Bearer ${gradeKey}`)
        .send({ source: SOURCE })
        .expect(403);
      expect(gradeRejected.body.code).toBe('ONECLICK_PLAN_REQUIRED');
    });

    it('rejects a missing key', async () => {
      const res = await request(app).post('/one-click-read').send({ source: SOURCE }).expect(401);
      expect(res.body.code).toBe('API_KEY_REQUIRED');
    });

    it('does not let a One-Click key open the QA mailbox API, Mail Grade, or Complaint Read', async () => {
      const oneClickKey = await issue('oneclick');

      const qa = await request(app)
        .post('/qa/mailboxes')
        .set('Authorization', `Bearer ${oneClickKey}`)
        .send({})
        .expect(403);
      expect(qa.body.code).toBe('QA_PLAN_REQUIRED');

      const grade = await request(app)
        .post('/mail-grade')
        .set('Authorization', `Bearer ${oneClickKey}`)
        .send({ source: SOURCE })
        .expect(403);
      expect(grade.body.code).toBe('GRADE_PLAN_REQUIRED');

      const complaint = await request(app)
        .post('/complaint-read')
        .set('Authorization', `Bearer ${oneClickKey}`)
        .send({ source: SOURCE })
        .expect(403);
      expect(complaint.body.code).toBe('COMPLAINT_PLAN_REQUIRED');
    });
  });
});
