process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.SENDER_PRICE_MONTHLY_USD = '12';
process.env.CHECKOUT_PAUSED = 'true';

const express = require('express');
const request = require('supertest');
const redisService = require('../../services/redisService');
const licenseService = require('../../services/licenseService');
const senderCheckService = require('../../services/senderCheckService');
const { browser, api } = require('../../routes/senderCheck');
const qaApiRoutes = require('../../routes/qaApi');
const mailGradeRoutes = require('../../routes/mailGrade');

jest.mock('../../services/senderCheckService', () => {
  const actual = jest.requireActual('../../services/senderCheckService');
  return {
    ...actual,
    checkDomain: jest.fn((domain, options) => actual.checkDomain(domain, options)),
  };
});

const REPORT = {
  domain: 'example.com',
  verdict: 'Ready',
  summary: 'Receivers can enforce a sender policy for example.com.',
  stored: false,
  records: [
    { id: 'mx', name: 'MX', status: 'pass', detail: 'Mail hosts are published: mx.example.com.', record: 'mx.example.com' },
    { id: 'spf', name: 'SPF', status: 'pass', detail: 'SPF names the servers that may send and rejects the rest.', record: 'v=spf1 -all' },
    { id: 'dmarc', name: 'DMARC', status: 'pass', detail: 'DMARC asks receivers to reject mail that fails alignment.', record: 'v=DMARC1; p=reject' },
  ],
};

const app = express();
app.use(express.json({ limit: '32kb' }));
app.use('/sender', browser);
app.use('/sender-check', api);
app.use('/qa', qaApiRoutes);
app.use('/mail-grade', mailGradeRoutes.api);

describe('Sender Check HTTP', () => {
  beforeEach(() => {
    redisService.client.data = {};
    senderCheckService.checkDomain.mockImplementation(
      (domain, options) => jest.requireActual('../../services/senderCheckService').checkDomain(domain, options)
    );
  });

  it('publishes the Sender Check API price separately from Pro and Mail Grade', async () => {
    const res = await request(app).get('/sender/offer').expect(200);

    expect(res.body.offer).toEqual({
      name: 'Sender Check API',
      type: 'sender',
      plan: 'monthly',
      usd: 12,
      checkoutPaused: true,
      endpoint: 'POST /api/sender-check',
    });
  });

  it('returns a client error for an empty domain', async () => {
    const res = await request(app).post('/sender/report').send({ domain: '  ' }).expect(400);
    expect(res.body.code).toBe('DOMAIN_EMPTY');
  });

  it('returns the checker report on the free route', async () => {
    senderCheckService.checkDomain.mockResolvedValue(REPORT);

    const res = await request(app)
      .post('/sender/report')
      .send({ domain: 'example.com' })
      .expect(200);

    expect(res.body.report).toEqual(REPORT);
    expect(senderCheckService.checkDomain).toHaveBeenCalledWith('example.com');
  });

  it('returns 503 when DNS does not answer', async () => {
    senderCheckService.checkDomain.mockRejectedValue(
      new senderCheckService.SenderCheckError('DNS_UNAVAILABLE', 'The DNS lookup did not answer. Try again.')
    );

    const res = await request(app)
      .post('/sender/report')
      .send({ domain: 'example.com' })
      .expect(503);

    expect(res.body.code).toBe('DNS_UNAVAILABLE');
  });

  describe('paid API', () => {
    const issue = async (type) => {
      const license = await licenseService.createLicense({
        type,
        plan: 'monthly',
        orderReference: `${type}-monthly-sender-test`,
        ttlSeconds: 3600,
      });
      return licenseService.createApiKey(license.key);
    };

    it('checks a domain for a Sender Check key and rejects Mail Grade and QA keys', async () => {
      senderCheckService.checkDomain.mockResolvedValue(REPORT);
      const senderKey = await issue('sender');
      const gradeKey = await issue('grade');
      const qaKey = await issue('api');

      const checked = await request(app)
        .post('/sender-check')
        .set('Authorization', `Bearer ${senderKey}`)
        .send({ domain: 'example.com' })
        .expect(200);

      expect(checked.body.report.verdict).toBe('Ready');

      const gradeRejected = await request(app)
        .post('/sender-check')
        .set('Authorization', `Bearer ${gradeKey}`)
        .send({ domain: 'example.com' })
        .expect(403);
      expect(gradeRejected.body.code).toBe('SENDER_PLAN_REQUIRED');

      const qaRejected = await request(app)
        .post('/sender-check')
        .set('Authorization', `Bearer ${qaKey}`)
        .send({ domain: 'example.com' })
        .expect(403);
      expect(qaRejected.body.code).toBe('SENDER_PLAN_REQUIRED');
    });

    it('rejects a missing key', async () => {
      const res = await request(app).post('/sender-check').send({ domain: 'example.com' }).expect(401);
      expect(res.body.code).toBe('API_KEY_REQUIRED');
    });

    it('does not let a Sender Check key grade mail or open a mailbox', async () => {
      const senderKey = await issue('sender');

      const graded = await request(app)
        .post('/mail-grade')
        .set('Authorization', `Bearer ${senderKey}`)
        .send({ source: 'From: Ada <ada@example.com>\r\n\r\nHi' })
        .expect(403);
      expect(graded.body.code).toBe('GRADE_PLAN_REQUIRED');

      const mailbox = await request(app)
        .post('/qa/mailboxes')
        .set('Authorization', `Bearer ${senderKey}`)
        .send({})
        .expect(403);
      expect(mailbox.body.code).toBe('QA_PLAN_REQUIRED');
    });
  });
});
