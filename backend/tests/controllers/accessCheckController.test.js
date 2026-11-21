process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.ACCESS_PRICE_MONTHLY_USD = '30';
process.env.CHECKOUT_PAUSED = 'true';

const express = require('express');
const request = require('supertest');
const redisService = require('../../services/redisService');
const licenseService = require('../../services/licenseService');
const { browser, api } = require('../../routes/accessCheck');
const mailGradeRoutes = require('../../routes/mailGrade');
const qaApiRoutes = require('../../routes/qaApi');

const SOURCE = [
  '<html lang="en">',
  '<body style="font-size:16px">',
  '<p>secret-token-access Your order shipped.</p>',
  '</body>',
  '</html>',
].join('');

const app = express();
app.use(express.json({ limit: '200kb' }));
app.use('/access', browser);
app.use('/access-read', api);
app.use('/mail-grade', mailGradeRoutes.api);
app.use('/qa', qaApiRoutes);

describe('Access Check HTTP', () => {
  beforeEach(() => {
    redisService.client.data = {};
  });

  it('publishes the Access Check API price separately from Pro and Mail Grade', async () => {
    const res = await request(app).get('/access/offer').expect(200);

    expect(res.body.offer).toEqual({
      name: 'Access Check API',
      type: 'access',
      plan: 'monthly',
      usd: 30,
      checkoutPaused: true,
      endpoint: 'POST /api/access-read',
    });
  });

  it('reads pasted HTML on the free route and does not keep the source', async () => {
    const res = await request(app)
      .post('/access/report')
      .send({ source: SOURCE })
      .expect(200);

    expect(res.body.report.stamp).toBe('CLEAR');
    expect(res.body.report.stored).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain('secret-token-access');
    expect(JSON.stringify(redisService.client.data)).not.toContain('secret-token-access');
  });

  it('returns a client error when the paste is not HTML', async () => {
    const res = await request(app)
      .post('/access/report')
      .send({ source: 'Hello from the meeting notes.' })
      .expect(400);

    expect(res.body.code).toBe('NOT_HTML');
  });

  it('returns a client error for an empty paste', async () => {
    const res = await request(app)
      .post('/access/report')
      .send({ source: '  ' })
      .expect(400);

    expect(res.body.code).toBe('EMPTY_ACCESS');
  });

  it('returns 413 when the email is larger than 64 KB', async () => {
    const res = await request(app)
      .post('/access/report')
      .send({ source: `<html lang="en"><body><p>${'x'.repeat((64 * 1024) + 1)}</p></body></html>` })
      .expect(413);

    expect(res.body.code).toBe('ACCESS_TOO_LARGE');
  });

  describe('paid API', () => {
    const issue = async (type) => {
      const license = await licenseService.createLicense({
        type,
        plan: 'monthly',
        orderReference: `${type}-monthly-access-test`,
        ttlSeconds: 3600,
      });
      return licenseService.createApiKey(license.key);
    };

    it('reads HTML for an Access Check key and a suite key, and rejects QA and Mail Grade keys', async () => {
      const accessKey = await issue('access');
      const suiteKey = await issue('suite');
      const qaKey = await issue('api');
      const gradeKey = await issue('grade');

      const read = await request(app)
        .post('/access-read')
        .set('Authorization', `Bearer ${accessKey}`)
        .send({ source: SOURCE })
        .expect(200);
      expect(read.body.report.stamp).toBe('CLEAR');

      const suite = await request(app)
        .post('/access-read')
        .set('Authorization', `Bearer ${suiteKey}`)
        .send({ source: SOURCE })
        .expect(200);
      expect(suite.body.report.stamp).toBe('CLEAR');

      const qaRejected = await request(app)
        .post('/access-read')
        .set('Authorization', `Bearer ${qaKey}`)
        .send({ source: SOURCE })
        .expect(403);
      expect(qaRejected.body.code).toBe('ACCESS_PLAN_REQUIRED');

      const gradeRejected = await request(app)
        .post('/access-read')
        .set('Authorization', `Bearer ${gradeKey}`)
        .send({ source: SOURCE })
        .expect(403);
      expect(gradeRejected.body.code).toBe('ACCESS_PLAN_REQUIRED');
    });

    it('rejects a missing key', async () => {
      const res = await request(app).post('/access-read').send({ source: SOURCE }).expect(401);
      expect(res.body.code).toBe('API_KEY_REQUIRED');
    });

    it('does not let an Access Check key open the QA mailbox API or Mail Grade', async () => {
      const accessKey = await issue('access');

      const qa = await request(app)
        .post('/qa/mailboxes')
        .set('Authorization', `Bearer ${accessKey}`)
        .send({})
        .expect(403);
      expect(qa.body.code).toBe('QA_PLAN_REQUIRED');

      const grade = await request(app)
        .post('/mail-grade')
        .set('Authorization', `Bearer ${accessKey}`)
        .send({ source: SOURCE })
        .expect(403);
      expect(grade.body.code).toBe('GRADE_PLAN_REQUIRED');
    });
  });
});
