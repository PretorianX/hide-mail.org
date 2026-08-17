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
  getLicense: jest.fn(),
  isActive: jest.fn(),
}));

jest.mock('../../services/orderService', () => ({
  createOrder: jest.fn().mockResolvedValue({ id: 'pro-monthly-test' }),
  markOrderPaid: jest.fn(),
  getOrder: jest.fn(),
}));

const billingController = require('../../controllers/billingController');
const licenseService = require('../../services/licenseService');
const wayforpayService = require('../../services/wayforpayService');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

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
});
