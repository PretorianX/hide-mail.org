process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.COMPLAINT_PRICE_MONTHLY_USD = '21';
process.env.CHECKOUT_PAUSED = 'true';

const express = require('express');
const request = require('supertest');
const redisService = require('../../services/redisService');
const licenseService = require('../../services/licenseService');
const { browser, api } = require('../../routes/complaintRead');
const mailGradeRoutes = require('../../routes/mailGrade');
const qaApiRoutes = require('../../routes/qaApi');

const SOURCE = [
  'Feedback-Type: abuse',
  'User-Agent: ExampleFBL/1.0',
  'Version: 1',
  'Original-Rcpt-To: <subscriber@example.net>',
  'Source-IP: 192.0.2.1',
  '',
].join('\n');

const app = express();
app.use(express.json({ limit: '200kb' }));
app.use('/complaints', browser);
app.use('/complaint-read', api);
app.use('/mail-grade', mailGradeRoutes.api);
app.use('/qa', qaApiRoutes);

describe('Complaint Read HTTP', () => {
  beforeEach(() => {
    redisService.client.data = {};
  });

  it('publishes the Complaint Read API price separately from Pro and Mail Grade', async () => {
    const res = await request(app).get('/complaints/offer').expect(200);

    expect(res.body.offer).toEqual({
      name: 'Complaint Read API',
      type: 'complaint',
      plan: 'monthly',
      usd: 21,
      checkoutPaused: true,
      endpoint: 'POST /api/complaint-read',
    });
  });

  it('reads a pasted feedback report on the free route and does not keep the source', async () => {
    const res = await request(app)
      .post('/complaints/report')
      .send({ source: `${SOURCE}\nX-Secret: secret-original-body` })
      .expect(200);

    expect(res.body.report.stamp).toBe('ABUSE');
    expect(res.body.report.recipient).toBe('subscriber@example.net');
    expect(res.body.report.stored).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain('secret-original-body');
    expect(JSON.stringify(redisService.client.data)).not.toContain('subscriber@example.net');
  });

  it('returns a client error when the paste is not a complaint', async () => {
    const res = await request(app)
      .post('/complaints/report')
      .send({ source: 'From: Ada <ada@example.com>\n\nHi' })
      .expect(400);

    expect(res.body.code).toBe('NOT_A_COMPLAINT');
  });

  it('returns a client error for an empty paste', async () => {
    const res = await request(app)
      .post('/complaints/report')
      .send({ source: '  ' })
      .expect(400);

    expect(res.body.code).toBe('EMPTY_COMPLAINT');
  });

  it('returns 413 when the complaint is larger than 64 KB', async () => {
    const res = await request(app)
      .post('/complaints/report')
      .send({ source: `${'x'.repeat((64 * 1024) + 1)}` })
      .expect(413);

    expect(res.body.code).toBe('COMPLAINT_TOO_LARGE');
  });

  describe('paid API', () => {
    const issue = async (type) => {
      const license = await licenseService.createLicense({
        type,
        plan: 'monthly',
        orderReference: `${type}-monthly-complaint-test`,
        ttlSeconds: 3600,
      });
      return licenseService.createApiKey(license.key);
    };

    it('reads a complaint for a Complaint Read key and rejects QA and Mail Grade keys', async () => {
      const complaintKey = await issue('complaint');
      const qaKey = await issue('api');
      const gradeKey = await issue('grade');

      const read = await request(app)
        .post('/complaint-read')
        .set('Authorization', `Bearer ${complaintKey}`)
        .send({ source: SOURCE })
        .expect(200);

      expect(read.body.report.recipient).toBe('subscriber@example.net');

      const qaRejected = await request(app)
        .post('/complaint-read')
        .set('Authorization', `Bearer ${qaKey}`)
        .send({ source: SOURCE })
        .expect(403);
      expect(qaRejected.body.code).toBe('COMPLAINT_PLAN_REQUIRED');

      const gradeRejected = await request(app)
        .post('/complaint-read')
        .set('Authorization', `Bearer ${gradeKey}`)
        .send({ source: SOURCE })
        .expect(403);
      expect(gradeRejected.body.code).toBe('COMPLAINT_PLAN_REQUIRED');
    });

    it('rejects a missing key', async () => {
      const res = await request(app).post('/complaint-read').send({ source: SOURCE }).expect(401);
      expect(res.body.code).toBe('API_KEY_REQUIRED');
    });

    it('does not let a Complaint Read key open the QA mailbox API or Mail Grade', async () => {
      const complaintKey = await issue('complaint');

      const qa = await request(app)
        .post('/qa/mailboxes')
        .set('Authorization', `Bearer ${complaintKey}`)
        .send({})
        .expect(403);
      expect(qa.body.code).toBe('QA_PLAN_REQUIRED');

      const grade = await request(app)
        .post('/mail-grade')
        .set('Authorization', `Bearer ${complaintKey}`)
        .send({ source: SOURCE })
        .expect(403);
      expect(grade.body.code).toBe('GRADE_PLAN_REQUIRED');
    });
  });
});
