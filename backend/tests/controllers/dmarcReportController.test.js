process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.REPORTS_PRICE_MONTHLY_USD = '15';
process.env.CHECKOUT_PAUSED = 'true';

const express = require('express');
const request = require('supertest');
const redisService = require('../../services/redisService');
const licenseService = require('../../services/licenseService');
const { browser, api } = require('../../routes/dmarcReport');
const mailGradeRoutes = require('../../routes/mailGrade');
const qaApiRoutes = require('../../routes/qaApi');

const XML = `<?xml version="1.0"?>
<feedback>
  <report_metadata>
    <org_name>google.com</org_name>
    <email>noreply-dmarc-support@google.com</email>
    <report_id>rpt-1</report_id>
    <date_range><begin>1512345600</begin><end>1512431999</end></date_range>
  </report_metadata>
  <policy_published>
    <domain>example.com</domain>
    <p>none</p>
    <sp>none</sp>
    <pct>100</pct>
  </policy_published>
  <record>
    <row>
      <source_ip>203.0.113.10</source_ip>
      <count>4</count>
      <policy_evaluated><disposition>none</disposition><dkim>pass</dkim><spf>pass</spf></policy_evaluated>
    </row>
    <identifiers><header_from>example.com</header_from></identifiers>
  </record>
</feedback>`;

const app = express();
app.use(express.json({ limit: '600kb' }));
app.use('/reports', browser);
app.use('/dmarc-reports', api);
app.use('/mail-grade', mailGradeRoutes.api);
app.use('/qa', qaApiRoutes);

describe('DMARC Reports HTTP', () => {
  beforeEach(() => {
    redisService.client.data = {};
  });

  it('publishes the DMARC Reports API price separately from Pro and Mail Grade', async () => {
    const res = await request(app).get('/reports/offer').expect(200);

    expect(res.body.offer).toEqual({
      name: 'DMARC Reports API',
      type: 'reports',
      plan: 'monthly',
      usd: 15,
      checkoutPaused: true,
      endpoint: 'POST /api/dmarc-reports',
    });
  });

  it('reads a pasted report on the free route', async () => {
    const res = await request(app)
      .post('/reports/read')
      .send({ xml: XML })
      .expect(200);

    expect(res.body.report.stored).toBe(false);
    expect(res.body.report.verdict).toBe('Aligned');
    expect(res.body.report.domain).toBe('example.com');
  });

  it('returns a client error when the paste is not a report', async () => {
    const res = await request(app)
      .post('/reports/read')
      .send({ xml: '<note>hello</note>' })
      .expect(400);

    expect(res.body.code).toBe('REPORT_NOT_FEEDBACK');
  });

  it('returns a client error for an empty paste', async () => {
    const res = await request(app)
      .post('/reports/read')
      .send({ xml: '  ' })
      .expect(400);

    expect(res.body.code).toBe('REPORT_REQUIRED');
  });

  describe('paid API', () => {
    const issue = async (type) => {
      const license = await licenseService.createLicense({
        type,
        plan: 'monthly',
        orderReference: `${type}-monthly-reports-test`,
        ttlSeconds: 3600,
      });
      return licenseService.createApiKey(license.key);
    };

    it('reads a report for a DMARC Reports key and rejects QA and Mail Grade keys', async () => {
      const reportsKey = await issue('reports');
      const qaKey = await issue('api');
      const gradeKey = await issue('grade');

      const read = await request(app)
        .post('/dmarc-reports')
        .set('Authorization', `Bearer ${reportsKey}`)
        .send({ xml: XML })
        .expect(200);

      expect(read.body.report.verdict).toBe('Aligned');

      const qaRejected = await request(app)
        .post('/dmarc-reports')
        .set('Authorization', `Bearer ${qaKey}`)
        .send({ xml: XML })
        .expect(403);
      expect(qaRejected.body.code).toBe('REPORTS_PLAN_REQUIRED');

      const gradeRejected = await request(app)
        .post('/dmarc-reports')
        .set('Authorization', `Bearer ${gradeKey}`)
        .send({ xml: XML })
        .expect(403);
      expect(gradeRejected.body.code).toBe('REPORTS_PLAN_REQUIRED');
    });

    it('rejects a missing key', async () => {
      const res = await request(app).post('/dmarc-reports').send({ xml: XML }).expect(401);
      expect(res.body.code).toBe('API_KEY_REQUIRED');
    });

    it('does not let a DMARC Reports key open the QA mailbox API or Mail Grade', async () => {
      const reportsKey = await issue('reports');

      const qa = await request(app)
        .post('/qa/mailboxes')
        .set('Authorization', `Bearer ${reportsKey}`)
        .send({})
        .expect(403);
      expect(qa.body.code).toBe('QA_PLAN_REQUIRED');

      const grade = await request(app)
        .post('/mail-grade')
        .set('Authorization', `Bearer ${reportsKey}`)
        .send({ source: 'From: a@b.c\n\nHi' })
        .expect(403);
      expect(grade.body.code).toBe('GRADE_PLAN_REQUIRED');
    });
  });
});
