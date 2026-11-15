process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.TLS_PRICE_MONTHLY_USD = '24';
process.env.CHECKOUT_PAUSED = 'true';

const express = require('express');
const request = require('supertest');
const redisService = require('../../services/redisService');
const licenseService = require('../../services/licenseService');
const { browser, api } = require('../../routes/tlsReport');
const mailGradeRoutes = require('../../routes/mailGrade');
const qaApiRoutes = require('../../routes/qaApi');

const SOURCE = JSON.stringify({
  'organization-name': 'Company-X',
  'date-range': {
    'start-datetime': '2016-04-01T00:00:00Z',
    'end-datetime': '2016-04-01T23:59:59Z',
  },
  'contact-info': 'sts-reporting@company-x.example',
  'report-id': '5065427c-23d3-47ca-b6e0-946ea0e8c4be',
  policies: [
    {
      policy: {
        'policy-type': 'sts',
        'policy-string': ['mode: testing'],
        'policy-domain': 'company-y.example',
        'mx-host': ['mx.company-y.example'],
      },
      summary: {
        'total-successful-session-count': 4,
        'total-failure-session-count': 1,
      },
      'failure-details': [
        {
          'result-type': 'certificate-expired',
          'sending-mta-ip': '192.0.2.10',
          'receiving-mx-hostname': 'mx.company-y.example',
          'receiving-ip': '192.0.2.20',
          'failed-session-count': 1,
        },
      ],
    },
  ],
});

const app = express();
app.use(express.json({ limit: '200kb' }));
app.use('/tls', browser);
app.use('/tls-reports', api);
app.use('/mail-grade', mailGradeRoutes.api);
app.use('/qa', qaApiRoutes);

describe('TLS Reports HTTP', () => {
  beforeEach(() => {
    redisService.client.data = {};
  });

  it('publishes the TLS Reports API price separately from Pro and Mail Grade', async () => {
    const res = await request(app).get('/tls/offer').expect(200);

    expect(res.body.offer).toEqual({
      name: 'TLS Reports API',
      type: 'tls',
      plan: 'monthly',
      usd: 24,
      checkoutPaused: true,
      endpoint: 'POST /api/tls-reports',
    });
  });

  it('reads a pasted TLS report on the free route and does not keep the source', async () => {
    const parsed = JSON.parse(SOURCE);
    parsed['secret-note'] = 'secret-original-body';
    const res = await request(app)
      .post('/tls/report')
      .send({ source: JSON.stringify(parsed) })
      .expect(200);

    expect(res.body.report.stamp).toBe('FAILURES');
    expect(res.body.report.policies[0].domain).toBe('company-y.example');
    expect(res.body.report.stored).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain('secret-original-body');
    expect(JSON.stringify(redisService.client.data)).not.toContain('company-y.example');
  });

  it('returns a client error when the paste is not a TLS report', async () => {
    const res = await request(app)
      .post('/tls/report')
      .send({ source: 'From: Ada <ada@example.com>\n\nHi' })
      .expect(400);

    expect(res.body.code).toBe('NOT_A_TLS_REPORT');
  });

  it('returns a client error for an empty paste', async () => {
    const res = await request(app)
      .post('/tls/report')
      .send({ source: '  ' })
      .expect(400);

    expect(res.body.code).toBe('EMPTY_TLS_REPORT');
  });

  it('returns 413 when the report is larger than 64 KB', async () => {
    const res = await request(app)
      .post('/tls/report')
      .send({ source: `${'x'.repeat((64 * 1024) + 1)}` })
      .expect(413);

    expect(res.body.code).toBe('TLS_TOO_LARGE');
  });

  describe('paid API', () => {
    const issue = async (type) => {
      const license = await licenseService.createLicense({
        type,
        plan: 'monthly',
        orderReference: `${type}-monthly-tls-test`,
        ttlSeconds: 3600,
      });
      return licenseService.createApiKey(license.key);
    };

    it('reads a report for a TLS Reports key and rejects QA and Mail Grade keys', async () => {
      const tlsKey = await issue('tls');
      const qaKey = await issue('api');
      const gradeKey = await issue('grade');

      const read = await request(app)
        .post('/tls-reports')
        .set('Authorization', `Bearer ${tlsKey}`)
        .send({ source: SOURCE })
        .expect(200);

      expect(read.body.report.policies[0].failures[0].receivingHost).toBe('mx.company-y.example');

      const qaRejected = await request(app)
        .post('/tls-reports')
        .set('Authorization', `Bearer ${qaKey}`)
        .send({ source: SOURCE })
        .expect(403);
      expect(qaRejected.body.code).toBe('TLS_PLAN_REQUIRED');

      const gradeRejected = await request(app)
        .post('/tls-reports')
        .set('Authorization', `Bearer ${gradeKey}`)
        .send({ source: SOURCE })
        .expect(403);
      expect(gradeRejected.body.code).toBe('TLS_PLAN_REQUIRED');
    });

    it('rejects a missing key', async () => {
      const res = await request(app).post('/tls-reports').send({ source: SOURCE }).expect(401);
      expect(res.body.code).toBe('API_KEY_REQUIRED');
    });

    it('does not let a TLS Reports key open the QA mailbox API or Mail Grade', async () => {
      const tlsKey = await issue('tls');

      const qa = await request(app)
        .post('/qa/mailboxes')
        .set('Authorization', `Bearer ${tlsKey}`)
        .send({})
        .expect(403);
      expect(qa.body.code).toBe('QA_PLAN_REQUIRED');

      const grade = await request(app)
        .post('/mail-grade')
        .set('Authorization', `Bearer ${tlsKey}`)
        .send({ source: SOURCE })
        .expect(403);
      expect(grade.body.code).toBe('GRADE_PLAN_REQUIRED');
    });
  });
});
