process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.WAYFORPAY_MERCHANT_ACCOUNT = 'test_merchant';
process.env.WAYFORPAY_SECRET_KEY = 'dhkq3vUi94{Z!5frxs(02ML';
process.env.WAYFORPAY_DOMAIN_NAME = 'www.market.ua';
process.env.WAYFORPAY_SERVICE_URL = 'https://hide-mail.org/api/billing/webhook';
process.env.WAYFORPAY_RETURN_URL = 'https://hide-mail.org/?pro=return';
process.env.PRO_PRICE_MONTHLY_UAH = '149';
process.env.PRO_PRICE_YEARLY_UAH = '1079';

jest.mock('../../config/config', () => {
  const actual = jest.requireActual('../../config/config');
  return {
    ...actual,
    wayforpay: {
      merchantAccount: 'test_merchant',
      secretKey: 'dhkq3vUi94{Z!5frxs(02ML',
      domainName: 'www.market.ua',
      serviceUrl: 'https://hide-mail.org/api/billing/webhook',
      returnUrl: 'https://hide-mail.org/?pro=return',
    },
    billing: {
      ...actual.billing,
      currency: 'UAH',
      monthlyAmount: 149,
      yearlyAmount: 1079,
      apiAmount: 799,
      monthlyUsdDisplay: '4.99',
      yearlyUsdDisplay: '36',
    },
  };
});

jest.mock('../../services/licenseService', () => ({
  createLicense: jest.fn(),
  renewByPayment: jest.fn(),
  revokeByPayment: jest.fn(),
  validateLicense: jest.fn(),
  findByOrderReference: jest.fn(),
  findByRecToken: jest.fn(),
  createApiKey: jest.fn(),
  validateApiKey: jest.fn(),
  getLicense: jest.fn(),
  isActive: jest.fn(),
  maskKey: jest.fn(() => 'HM-****-DDDD'),
}));

jest.mock('../../services/orderService', () => ({
  createOrder: jest.fn().mockResolvedValue({ id: 'pro-monthly-test' }),
  markOrderPaid: jest.fn(),
  markCallbackApplied: jest.fn(),
  getOrder: jest.fn(),
  createHandoffToken: jest.fn().mockResolvedValue('handoff-token-1'),
  resolveHandoffToken: jest.fn(),
  consumeHandoffToken: jest.fn(),
}));

const billingController = require('../../controllers/billingController');
const licenseService = require('../../services/licenseService');
const orderService = require('../../services/orderService');
const wayforpayService = require('../../services/wayforpayService');
const metrics = require('../../services/metricsService');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockNext = jest.fn();

describe('billingController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listPlans', () => {
    it('returns public Pro and API prices without secrets', () => {
      const res = mockRes();
      billingController.listPlans({}, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload.plans).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'monthly', amount: 149 }),
        expect.objectContaining({ id: 'yearly', amount: 1079 }),
        expect.objectContaining({ id: 'api' }),
      ]));
      expect(JSON.stringify(payload)).not.toMatch(/secret/i);
    });
  });

  describe('checkout', () => {
    it('returns a signed WayForPay payload for a monthly Pro subscription', async () => {
      const req = { body: { plan: 'monthly' } };
      const res = mockRes();

      await billingController.checkout(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(true);
      expect(payload.data.orderReference).toMatch(/^pro-monthly-/);
      expect(payload.data.amount).toBe(149);
      expect(payload.data.regularMode).toBe('monthly');
      expect(payload.data.merchantSignature).toBeTruthy();
    });

    it('rejects an unknown plan', async () => {
      const req = { body: { plan: 'lifetime' } };
      const res = mockRes();

      await billingController.checkout(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('charges the API price for an API order instead of the Pro price', async () => {
      const req = { body: { plan: 'monthly', type: 'api' } };
      const res = mockRes();

      await billingController.checkout(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.data.orderReference).toMatch(/^api-monthly-/);
      expect(payload.data.amount).toBe(799);
      expect(orderService.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'api', amount: 799 })
      );
    });

    it('rejects a yearly API order because the API tariff is monthly only', async () => {
      const req = { body: { plan: 'yearly', type: 'api' } };
      const res = mockRes();

      await billingController.checkout(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(orderService.createOrder).not.toHaveBeenCalled();
    });
  });

  describe('webhook', () => {
    it('activates a new license on Approved and acknowledges', async () => {
      const callback = {
        merchantAccount: 'test_merchant',
        orderReference: 'pro-monthly-new',
        amount: 149,
        currency: 'UAH',
        authCode: '541963',
        cardPan: '41****8217',
        transactionStatus: 'Approved',
        reasonCode: '1100',
        recToken: 'rec-abc',
      };
      callback.merchantSignature = wayforpayService.signCallback(
        callback,
        process.env.WAYFORPAY_SECRET_KEY
      );

      licenseService.findByRecToken.mockResolvedValue(null);
      licenseService.findByOrderReference.mockResolvedValue(null);
      orderService.getOrder.mockResolvedValue({
        id: 'pro-monthly-new',
        type: 'pro',
        plan: 'monthly',
        amount: 149,
        currency: 'UAH',
      });
      licenseService.createLicense.mockResolvedValue({
        key: 'HM-AAAA-BBBB-CCCC-DDDD',
        type: 'pro',
        plan: 'monthly',
      });

      const req = { body: callback };
      const res = mockRes();
      await billingController.webhook(req, res);

      expect(licenseService.createLicense).toHaveBeenCalledWith(expect.objectContaining({
        type: 'pro',
        plan: 'monthly',
        orderReference: 'pro-monthly-new',
        recToken: 'rec-abc',
      }));
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        orderReference: 'pro-monthly-new',
        status: 'accept',
      }));
    });

    // WayForPay keeps retrying a callback until it is acknowledged, so a queue of replays can
    // outlive the status they describe. On 2026-08-17 a refunded order was activated because an
    // Approved replay arrived 44 minutes after the Refunded callback had settled the transaction.
    describe('replayed callbacks', () => {
      const approvedReplay = (processingDate) => {
        const callback = {
          merchantAccount: 'test_merchant',
          orderReference: 'pro-monthly-replay',
          amount: 149,
          currency: 'UAH',
          authCode: '541963',
          cardPan: '41****8217',
          transactionStatus: 'Approved',
          reasonCode: '1100',
          recToken: 'rec-replay',
          processingDate,
        };
        callback.merchantSignature = wayforpayService.signCallback(
          callback,
          process.env.WAYFORPAY_SECRET_KEY
        );
        return callback;
      };

      it('ignores an Approved replay that a later callback has already superseded', async () => {
        orderService.getOrder.mockResolvedValue({
          id: 'pro-monthly-replay',
          type: 'pro',
          plan: 'monthly',
          amount: 149,
          currency: 'UAH',
          lastCallbackProcessingDate: 1786994135,
        });

        const res = mockRes();
        await billingController.webhook({ body: approvedReplay(1786992999) }, res);

        expect(licenseService.createLicense).not.toHaveBeenCalled();
        expect(licenseService.renewByPayment).not.toHaveBeenCalled();
        // Acknowledged all the same, otherwise WayForPay retries the stale event forever.
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'accept' }));
      });

      // A duplicate takes the renewal branch, because the licence it created is now findable by
      // orderReference, so re-applying one would extend the licence and book the sale twice.
      it('ignores a re-delivery of the callback it has already applied', async () => {
        orderService.getOrder.mockResolvedValue({
          id: 'pro-monthly-replay',
          type: 'pro',
          plan: 'monthly',
          amount: 149,
          currency: 'UAH',
          lastCallbackProcessingDate: 1786994135,
        });

        const res = mockRes();
        await billingController.webhook({ body: approvedReplay(1786994135) }, res);

        expect(licenseService.createLicense).not.toHaveBeenCalled();
        expect(licenseService.renewByPayment).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'accept' }));
      });

      it('applies a callback that is newer than the one already recorded', async () => {
        licenseService.findByRecToken.mockResolvedValue(null);
        licenseService.findByOrderReference.mockResolvedValue(null);
        orderService.getOrder.mockResolvedValue({
          id: 'pro-monthly-replay',
          type: 'pro',
          plan: 'monthly',
          amount: 149,
          currency: 'UAH',
          lastCallbackProcessingDate: 1786992999,
        });
        licenseService.createLicense.mockResolvedValue({
          key: 'HM-AAAA-BBBB-CCCC-DDDD',
          type: 'pro',
          plan: 'monthly',
        });

        const res = mockRes();
        await billingController.webhook({ body: approvedReplay(1786994135) }, res);

        expect(licenseService.createLicense).toHaveBeenCalled();
      });

      it('records the processing date it applied, so the next replay can be recognised', async () => {
        licenseService.findByRecToken.mockResolvedValue(null);
        licenseService.findByOrderReference.mockResolvedValue(null);
        orderService.getOrder.mockResolvedValue({
          id: 'pro-monthly-replay',
          type: 'pro',
          plan: 'monthly',
          amount: 149,
          currency: 'UAH',
        });
        licenseService.createLicense.mockResolvedValue({
          key: 'HM-AAAA-BBBB-CCCC-DDDD',
          type: 'pro',
          plan: 'monthly',
        });

        await billingController.webhook({ body: approvedReplay(1786994135) }, mockRes());

        expect(orderService.markCallbackApplied).toHaveBeenCalledWith(
          'pro-monthly-replay',
          1786994135
        );
      });

      it('still applies a callback that carries no processing date', async () => {
        licenseService.findByRecToken.mockResolvedValue(null);
        licenseService.findByOrderReference.mockResolvedValue(null);
        orderService.getOrder.mockResolvedValue({
          id: 'pro-monthly-replay',
          type: 'pro',
          plan: 'monthly',
          amount: 149,
          currency: 'UAH',
          lastCallbackProcessingDate: 1786994135,
        });
        licenseService.createLicense.mockResolvedValue({
          key: 'HM-AAAA-BBBB-CCCC-DDDD',
          type: 'pro',
          plan: 'monthly',
        });

        const callback = approvedReplay(undefined);
        delete callback.processingDate;
        callback.merchantSignature = wayforpayService.signCallback(
          callback,
          process.env.WAYFORPAY_SECRET_KEY
        );

        await billingController.webhook({ body: callback }, mockRes());

        expect(licenseService.createLicense).toHaveBeenCalled();
      });

      it('ignores a superseded Refunded replay instead of revoking again', async () => {
        const callback = {
          merchantAccount: 'test_merchant',
          orderReference: 'pro-monthly-replay',
          amount: 149,
          currency: 'UAH',
          authCode: '541963',
          cardPan: '41****8217',
          transactionStatus: 'Refunded',
          reasonCode: '1100',
          recToken: 'rec-replay',
          processingDate: 1786992999,
        };
        callback.merchantSignature = wayforpayService.signCallback(
          callback,
          process.env.WAYFORPAY_SECRET_KEY
        );

        orderService.getOrder.mockResolvedValue({
          id: 'pro-monthly-replay',
          lastCallbackProcessingDate: 1786994135,
        });

        await billingController.webhook({ body: callback }, mockRes());

        expect(licenseService.revokeByPayment).not.toHaveBeenCalled();
      });
    });

    it('rejects a callback with a bad signature', async () => {
      const req = {
        body: {
          orderReference: 'pro-monthly-bad',
          transactionStatus: 'Approved',
          merchantSignature: 'deadbeef',
        },
      };
      const res = mockRes();
      await billingController.webhook(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(licenseService.createLicense).not.toHaveBeenCalled();
    });

    it('renews an existing license on a later regular payment with a new orderReference', async () => {
      const callback = {
        merchantAccount: 'test_merchant',
        orderReference: 'WFP-recurring-99',
        amount: 149,
        currency: 'UAH',
        authCode: '541963',
        cardPan: '41****8217',
        transactionStatus: 'Approved',
        reasonCode: '1100',
        recToken: 'rec-abc',
      };
      callback.merchantSignature = wayforpayService.signCallback(
        callback,
        process.env.WAYFORPAY_SECRET_KEY
      );

      licenseService.findByRecToken.mockResolvedValue({
        key: 'HM-AAAA-BBBB-CCCC-DDDD',
        type: 'pro',
        plan: 'monthly',
      });
      licenseService.renewByPayment.mockResolvedValue({
        key: 'HM-AAAA-BBBB-CCCC-DDDD',
        type: 'pro',
        plan: 'monthly',
      });

      const req = { body: callback };
      const res = mockRes();
      await billingController.webhook(req, res);

      expect(licenseService.createLicense).not.toHaveBeenCalled();
      expect(licenseService.renewByPayment).toHaveBeenCalledWith(expect.objectContaining({
        recToken: 'rec-abc',
        orderReference: 'WFP-recurring-99',
      }));
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        status: 'accept',
      }));
    });

    const signedApproved = (overrides) => {
      const callback = {
        merchantAccount: 'test_merchant',
        orderReference: 'pro-monthly-new',
        amount: 149,
        currency: 'UAH',
        authCode: '541963',
        cardPan: '41****8217',
        transactionStatus: 'Approved',
        reasonCode: '1100',
        ...overrides,
      };
      callback.merchantSignature = wayforpayService.signCallback(
        callback,
        process.env.WAYFORPAY_SECRET_KEY
      );
      return callback;
    };

    it('does not issue a license when no matching order was ever created', async () => {
      licenseService.findByRecToken.mockResolvedValue(null);
      licenseService.findByOrderReference.mockResolvedValue(null);
      orderService.getOrder.mockResolvedValue(null);

      const res = mockRes();
      await billingController.webhook({ body: signedApproved({}) }, res);

      expect(licenseService.createLicense).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('does not issue a license when the paid amount differs from the order', async () => {
      licenseService.findByRecToken.mockResolvedValue(null);
      licenseService.findByOrderReference.mockResolvedValue(null);
      orderService.getOrder.mockResolvedValue({
        id: 'pro-monthly-new',
        type: 'pro',
        plan: 'yearly',
        amount: 1079,
        currency: 'UAH',
      });

      const res = mockRes();
      await billingController.webhook({ body: signedApproved({ amount: 1 }) }, res);

      expect(licenseService.createLicense).not.toHaveBeenCalled();
    });

    it('takes the plan from the stored order, not from the orderReference', async () => {
      licenseService.findByRecToken.mockResolvedValue(null);
      licenseService.findByOrderReference.mockResolvedValue(null);
      orderService.getOrder.mockResolvedValue({
        id: 'pro-yearly-spoofed',
        type: 'pro',
        plan: 'monthly',
        amount: 149,
        currency: 'UAH',
      });
      licenseService.createLicense.mockResolvedValue({ key: 'HM-A', type: 'pro' });

      const res = mockRes();
      await billingController.webhook(
        { body: signedApproved({ orderReference: 'pro-yearly-spoofed' }) },
        res
      );

      expect(licenseService.createLicense).toHaveBeenCalledWith(
        expect.objectContaining({ plan: 'monthly' })
      );
    });
  });

  describe('getOrder', () => {
    it('returns the license key from a one-time handoff token', async () => {
      orderService.resolveHandoffToken.mockResolvedValue('pro-monthly-1');
      orderService.consumeHandoffToken.mockResolvedValue('pro-monthly-1');
      orderService.getOrder.mockResolvedValue({
        id: 'pro-monthly-1',
        status: 'paid',
        paidAt: Date.now(),
        licenseKey: 'HM-AAAA-BBBB-CCCC-DDDD',
      });
      const res = mockRes();
      await billingController.getOrder({ params: { handoffToken: 'handoff-token-1' } }, res, mockNext);

      expect(res.json.mock.calls[0][0].licenseKey).toBe('HM-AAAA-BBBB-CCCC-DDDD');
      expect(res.json.mock.calls[0][0].apiKey).toBeNull();
    });

    it('rejects an expired or already-used handoff token', async () => {
      orderService.resolveHandoffToken.mockResolvedValue(null);
      const res = mockRes();
      await billingController.getOrder({ params: { handoffToken: 'expired' } }, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(orderService.getOrder).not.toHaveBeenCalled();
    });

    it('stops handing out the license key once the handoff window closed', async () => {
      orderService.resolveHandoffToken.mockResolvedValue('pro-monthly-1');
      orderService.getOrder.mockResolvedValue({
        id: 'pro-monthly-1',
        status: 'paid',
        paidAt: Date.now() - 25 * 60 * 60 * 1000,
        licenseKey: 'HM-AAAA-BBBB-CCCC-DDDD',
        apiKey: 'hm_api_secret',
      });
      const res = mockRes();
      await billingController.getOrder({ params: { handoffToken: 'handoff-token-1' } }, res, mockNext);

      const payload = res.json.mock.calls[0][0];
      expect(payload.licenseKey).toBeNull();
      expect(payload.apiKey).toBeNull();
      expect(JSON.stringify(payload)).not.toContain('HM-AAAA');
      expect(JSON.stringify(payload)).not.toContain('hm_api_secret');
    });
  });

  describe('validateLicense', () => {
    it('returns an active license for a valid key', async () => {
      licenseService.validateLicense.mockResolvedValue({
        active: true,
        key: 'HM-AAAA-BBBB-CCCC-DDDD',
        type: 'pro',
      });
      licenseService.getLicense.mockResolvedValue({
        key: 'HM-AAAA-BBBB-CCCC-DDDD',
        type: 'pro',
        status: 'active',
        expiresAt: Date.now() + 60_000,
      });
      const req = { body: { key: 'HM-AAAA-BBBB-CCCC-DDDD' } };
      const res = mockRes();
      await billingController.validateLicense(req, res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        license: expect.objectContaining({ active: true, type: 'pro' }),
      }));
    });
  });

  describe('issueApiKey', () => {
    const activeApiLicense = {
      key: 'HM-AAAA-BBBB-CCCC-DDDD',
      type: 'api',
      plan: 'monthly',
      status: 'active',
      expiresAt: Date.now() + 20 * 24 * 60 * 60 * 1000,
    };

    it('hands an API subscriber a fresh key for their license', async () => {
      licenseService.getLicense.mockResolvedValue(activeApiLicense);
      licenseService.isActive.mockReturnValue(true);
      licenseService.createApiKey.mockResolvedValue('hm_api_newkey');
      licenseService.validateApiKey.mockResolvedValue({
        expiresAt: Date.now() + 20 * 24 * 60 * 60 * 1000,
        remainingDays: 20,
      });

      const res = mockRes();
      await billingController.issueApiKey({ body: { key: activeApiLicense.key } }, res);

      expect(licenseService.createApiKey).toHaveBeenCalledWith(activeApiLicense.key);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json.mock.calls[0][0]).toEqual(expect.objectContaining({
        success: true,
        apiKey: 'hm_api_newkey',
        remainingDays: 20,
      }));
    });

    it('refuses a Pro license, which carries no API access', async () => {
      licenseService.getLicense.mockResolvedValue({ ...activeApiLicense, type: 'pro' });
      licenseService.isActive.mockReturnValue(true);

      const res = mockRes();
      await billingController.issueApiKey({ body: { key: activeApiLicense.key } }, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(licenseService.createApiKey).not.toHaveBeenCalled();
    });

    it('refuses an expired or unknown license without leaking which', async () => {
      licenseService.getLicense.mockResolvedValue(null);
      licenseService.isActive.mockReturnValue(false);

      const res = mockRes();
      await billingController.issueApiKey({ body: { key: 'HM-XXXX-XXXX-XXXX-XXXX' } }, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(licenseService.createApiKey).not.toHaveBeenCalled();
    });
  });

  describe('subscription metrics', () => {
    const signed = (overrides) => {
      const callback = {
        merchantAccount: 'test_merchant',
        orderReference: 'pro-monthly-metrics',
        amount: 149,
        currency: 'UAH',
        authCode: '541963',
        cardPan: '41****8217',
        transactionStatus: 'Approved',
        reasonCode: '1100',
        ...overrides,
      };
      callback.merchantSignature = wayforpayService.signCallback(
        callback,
        process.env.WAYFORPAY_SECRET_KEY
      );
      return callback;
    };

    const storedOrder = (overrides = {}) => ({
      id: 'pro-monthly-metrics',
      type: 'pro',
      plan: 'monthly',
      amount: 149,
      currency: 'UAH',
      ...overrides,
    });

    it('counts a checkout by type and plan', async () => {
      await billingController.checkout({ body: { plan: 'yearly' } }, mockRes());

      expect(metrics.billingCheckoutsTotal.inc).toHaveBeenCalledWith({
        type: 'pro',
        plan: 'yearly',
      });
    });

    it('does not count a checkout that was rejected as an invalid plan', async () => {
      await billingController.checkout({ body: { plan: 'weekly' } }, mockRes());

      expect(metrics.billingCheckoutsTotal.inc).not.toHaveBeenCalled();
    });

    it('books revenue at the price we hold for the plan, not the amount in the callback', async () => {
      licenseService.findByRecToken.mockResolvedValue(null);
      licenseService.findByOrderReference.mockResolvedValue(null);
      orderService.getOrder.mockResolvedValue(storedOrder({ plan: 'yearly', amount: 1079 }));
      licenseService.createLicense.mockResolvedValue({
        key: 'HM-A',
        type: 'pro',
        plan: 'yearly',
      });

      await billingController.webhook({ body: signed({ amount: 1079 }) }, mockRes());

      expect(metrics.billingRevenueTotal.inc).toHaveBeenCalledWith(
        { currency: 'UAH', type: 'pro', plan: 'yearly' },
        1079
      );
      expect(metrics.billingWebhookEventsTotal.inc).toHaveBeenCalledWith({
        result: 'license_created',
      });
    });

    it('marks a recurring charge as a renewal', async () => {
      licenseService.findByRecToken.mockResolvedValue({
        key: 'HM-A',
        type: 'pro',
        plan: 'monthly',
      });
      licenseService.renewByPayment.mockResolvedValue({
        key: 'HM-A',
        type: 'pro',
        plan: 'monthly',
      });

      await billingController.webhook({ body: signed({ recToken: 'rec-1' }) }, mockRes());

      expect(metrics.billingWebhookEventsTotal.inc).toHaveBeenCalledWith({
        result: 'license_renewed',
      });
      expect(metrics.billingRevenueTotal.inc).toHaveBeenCalledWith(
        { currency: 'UAH', type: 'pro', plan: 'monthly' },
        149
      );
    });

    it('books no revenue when the paid amount does not match the order', async () => {
      licenseService.findByRecToken.mockResolvedValue(null);
      licenseService.findByOrderReference.mockResolvedValue(null);
      orderService.getOrder.mockResolvedValue(storedOrder());

      await billingController.webhook({ body: signed({ amount: 1 }) }, mockRes());

      expect(metrics.billingRevenueTotal.inc).not.toHaveBeenCalled();
      expect(metrics.billingWebhookEventsTotal.inc).toHaveBeenCalledWith({
        result: 'amount_mismatch',
      });
    });

    it('separates an unknown order from a forged signature', async () => {
      licenseService.findByRecToken.mockResolvedValue(null);
      licenseService.findByOrderReference.mockResolvedValue(null);
      orderService.getOrder.mockResolvedValue(null);
      await billingController.webhook({ body: signed({}) }, mockRes());

      expect(metrics.billingWebhookEventsTotal.inc).toHaveBeenCalledWith({
        result: 'unknown_order',
      });

      metrics.billingWebhookEventsTotal.inc.mockClear();
      await billingController.webhook(
        { body: { ...signed({}), merchantSignature: 'forged' } },
        mockRes()
      );

      expect(metrics.billingWebhookEventsTotal.inc).toHaveBeenCalledWith({
        result: 'invalid_signature',
      });
    });

    it('records a refund as a revocation and a declined payment as ignored', async () => {
      licenseService.revokeByPayment.mockResolvedValue(true);
      await billingController.webhook(
        { body: signed({ transactionStatus: 'Refunded' }) },
        mockRes()
      );

      expect(metrics.billingWebhookEventsTotal.inc).toHaveBeenCalledWith({
        result: 'license_revoked',
      });

      metrics.billingWebhookEventsTotal.inc.mockClear();
      await billingController.webhook(
        { body: signed({ transactionStatus: 'Declined' }) },
        mockRes()
      );

      expect(metrics.billingWebhookEventsTotal.inc).toHaveBeenCalledWith({ result: 'ignored' });
    });
  });
});
