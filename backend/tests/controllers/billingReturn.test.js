process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.WAYFORPAY_MERCHANT_ACCOUNT = 'test_merchant';
process.env.WAYFORPAY_SECRET_KEY = 'dhkq3vUi94{Z!5frxs(02ML';
process.env.WAYFORPAY_DOMAIN_NAME = 'hide-mail.org';
process.env.WAYFORPAY_SERVICE_URL = 'https://hide-mail.org/api/billing/webhook';
process.env.WAYFORPAY_RETURN_URL = 'https://hide-mail.org/pro';

const wayforpayService = require('../../services/wayforpayService');

describe('WayForPay customer return', () => {
  describe('checkout payload', () => {
    it('sends the customer back through the API, which can accept a POST', () => {
      const payload = wayforpayService.buildCheckoutPayload({
        type: 'pro',
        plan: 'monthly',
        orderReference: 'pro-monthly-abc',
        orderDate: 1786992999,
        dateNext: '17.09.2026',
      });

      // WayForPay POSTs the payer to returnUrl. Static hosting answers POST with 405, so the
      // return has to land on the API, which redirects the browser to the Pro page.
      expect(payload.returnUrl).toBe(
        'https://hide-mail.org/api/billing/return?orderReference=pro-monthly-abc'
      );
    });

    it('keeps the return URL out of the purchase signature', () => {
      const payload = wayforpayService.buildCheckoutPayload({
        type: 'pro',
        plan: 'monthly',
        orderReference: 'pro-monthly-abc',
        orderDate: 1786992999,
        dateNext: '17.09.2026',
      });

      const withDifferentReturn = { ...payload, returnUrl: 'https://example.com/other' };
      expect(wayforpayService.signPurchase(withDifferentReturn, 'dhkq3vUi94{Z!5frxs(02ML')).toBe(
        payload.merchantSignature
      );
    });
  });

  describe('customerReturn controller', () => {
    const mockRes = () => {
      const res = {};
      res.redirect = jest.fn(() => res);
      res.status = jest.fn(() => res);
      res.json = jest.fn(() => res);
      return res;
    };

    it('redirects a POST from WayForPay to the Pro page, preserving the order reference', () => {
      const billingController = require('../../controllers/billingController');
      const res = mockRes();

      billingController.customerReturn(
        { query: { orderReference: 'pro-monthly-abc' }, body: { transactionStatus: 'Approved' } },
        res
      );

      expect(res.redirect).toHaveBeenCalledWith(
        302,
        'https://hide-mail.org/pro?orderReference=pro-monthly-abc'
      );
    });

    it('redirects to the Pro page even without an order reference', () => {
      const billingController = require('../../controllers/billingController');
      const res = mockRes();

      billingController.customerReturn({ query: {}, body: {} }, res);

      expect(res.redirect).toHaveBeenCalledWith(302, 'https://hide-mail.org/pro');
    });

    it('is reachable as a POST through the billing router, the way WayForPay sends it', async () => {
      const express = require('express');
      const request = require('supertest');
      const { applyBodyParsers } = require('../../middleware/bodyParsers');

      const app = express();
      applyBodyParsers(app);
      app.use('/api/billing', require('../../routes/billing'));

      const res = await request(app)
        .post('/api/billing/return?orderReference=pro-monthly-abc')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send('transactionStatus=Approved&reasonCode=1100')
        .expect(302);

      expect(res.headers.location).toBe('https://hide-mail.org/pro?orderReference=pro-monthly-abc');
    });

    it('ignores an attacker supplied order reference that is not a string', () => {
      const billingController = require('../../controllers/billingController');
      const res = mockRes();

      billingController.customerReturn({ query: { orderReference: ['a', 'b'] }, body: {} }, res);

      expect(res.redirect).toHaveBeenCalledWith(302, 'https://hide-mail.org/pro');
    });
  });
});
