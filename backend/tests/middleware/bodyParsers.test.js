process.env.VALID_DOMAINS = 'hide-mail.org';

const express = require('express');
const request = require('supertest');

const { applyBodyParsers, WEBHOOK_PATH } = require('../../middleware/bodyParsers');
const wayforpayService = require('../../services/wayforpayService');

const SECRET = 'dhkq3vUi94{Z!5frxs(02ML';

// Captured from a real WayForPay delivery to production on 2026-08-17. The transport detail
// that matters: the body is a JSON document, but the request is labelled as form data.
const realCallback = {
  merchantAccount: 'hide_mail_org',
  orderReference: 'pro-monthly-ba0b55af-3d25-41da-bb50-b68ba5379e66',
  amount: 149,
  currency: 'UAH',
  authCode: '165894',
  email: null,
  phone: null,
  createdDate: 1786992999,
  processingDate: 1786994135,
  cardPan: '',
  cardType: null,
  recToken: '',
  transactionStatus: 'Approved',
  reason: 'Ok',
  reasonCode: 1100,
  fee: 0,
  paymentSystem: 'googlePay',
};

const signedCallback = (overrides = {}) => {
  const payload = { ...realCallback, ...overrides };
  payload.merchantSignature = wayforpayService.signCallback(payload, SECRET);
  return payload;
};

const buildApp = () => {
  const app = express();
  applyBodyParsers(app);
  app.post(WEBHOOK_PATH, (req, res) => res.json({ body: req.body }));
  app.post('/api/other', (req, res) => res.json({ body: req.body }));
  app.post('/api/reports/read', (req, res) => res.json({ bytes: req.body?.xml?.length || 0 }));
  app.use((err, req, res, _next) => {
    res.status(err.status || err.statusCode || 500).json({ error: err.message });
  });
  return app;
};

describe('body parsers', () => {
  describe('WayForPay webhook delivery', () => {
    it('decodes a JSON body that is labelled application/x-www-form-urlencoded', async () => {
      const payload = signedCallback();

      const res = await request(buildApp())
        .post(WEBHOOK_PATH)
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send(JSON.stringify(payload))
        .expect(200);

      expect(res.body.body).toEqual(payload);
    });

    it('produces a body whose signature verifies, which is what the 400 regression broke', async () => {
      const payload = signedCallback();

      const res = await request(buildApp())
        .post(WEBHOOK_PATH)
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send(JSON.stringify(payload))
        .expect(200);

      expect(wayforpayService.verifyCallbackSignature(res.body.body, SECRET)).toBe(true);
    });

    it('still decodes a body that is labelled application/json', async () => {
      const payload = signedCallback();

      const res = await request(buildApp())
        .post(WEBHOOK_PATH)
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(payload))
        .expect(200);

      expect(wayforpayService.verifyCallbackSignature(res.body.body, SECRET)).toBe(true);
    });

    it('rejects a webhook body that is not JSON', async () => {
      await request(buildApp())
        .post(WEBHOOK_PATH)
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send('merchantAccount=hide_mail_org&amount=149')
        .expect(400);
    });
  });

  describe('other routes', () => {
    it('parses ordinary JSON requests', async () => {
      const res = await request(buildApp())
        .post('/api/other')
        .send({ type: 'pro', plan: 'monthly' })
        .expect(200);

      expect(res.body.body).toEqual({ type: 'pro', plan: 'monthly' });
    });

    it('accepts a DMARC report larger than the default JSON limit', async () => {
      const xml = 'x'.repeat(120 * 1024);
      const res = await request(buildApp())
        .post('/api/reports/read')
        .send({ xml })
        .expect(200);

      expect(res.body.bytes).toBe(xml.length);
    });

    it('keeps the default JSON limit on other routes', async () => {
      await request(buildApp())
        .post('/api/other')
        .send({ xml: 'x'.repeat(120 * 1024) })
        .expect(413);
    });

    it('parses ordinary form requests', async () => {
      const res = await request(buildApp())
        .post('/api/other')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send('type=pro&plan=monthly')
        .expect(200);

      expect(res.body.body).toEqual({ type: 'pro', plan: 'monthly' });
    });
  });
});
