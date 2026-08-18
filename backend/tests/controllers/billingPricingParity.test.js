/**
 * Listed UAH must equal the UAH stored on the order and signed into the WayForPay
 * payload, given the same mocked WayForPay rates. USD is the source of truth.
 */

process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.WAYFORPAY_MERCHANT_ACCOUNT = 'test_merchant';
process.env.WAYFORPAY_SECRET_KEY = 'dhkq3vUi94{Z!5frxs(02ML';
process.env.WAYFORPAY_DOMAIN_NAME = 'www.market.ua';
process.env.WAYFORPAY_SERVICE_URL = 'https://hide-mail.org/api/billing/webhook';
process.env.WAYFORPAY_RETURN_URL = 'https://hide-mail.org/?pro=return';
process.env.PRO_PRICE_MONTHLY_USD = '3.49';
process.env.PRO_PRICE_YEARLY_USD = '24.99';
process.env.API_PRICE_MONTHLY_USD = '7.99';

jest.mock('../../services/exchangeRateService', () => ({
  getRates: jest.fn(),
}));

jest.mock('../../services/orderService', () => ({
  createOrder: jest.fn().mockResolvedValue({ id: 'pro-monthly-test' }),
  markOrderPaid: jest.fn(),
  markCallbackApplied: jest.fn(),
  getOrder: jest.fn(),
  createHandoffToken: jest.fn(),
  resolveHandoffToken: jest.fn(),
  consumeHandoffToken: jest.fn(),
}));

const billingController = require('../../controllers/billingController');
const exchangeRateService = require('../../services/exchangeRateService');
const orderService = require('../../services/orderService');
const wayforpayService = require('../../services/wayforpayService');

const RATES = { USD: 41.5, EUR: 45.2, GBP: 52.1 };
// 3.49 * 41.5 = 144.835 → floor to 10 UAH = 140
const MONTHLY_UAH = 140;

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('listPlans and checkout share one UAH quote', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    exchangeRateService.getRates.mockResolvedValue({
      rates: RATES,
      ratesDate: 1519115604,
      fetchedAt: Date.now(),
    });
  });

  it('lists the same UAH amount that checkout stores and signs for the same mocked rate', async () => {
    const listedRes = mockRes();
    await billingController.listPlans({}, listedRes);
    const listed = listedRes.json.mock.calls[0][0].plans.find((plan) => plan.id === 'monthly');

    const checkoutRes = mockRes();
    await billingController.checkout({ body: { plan: 'monthly' } }, checkoutRes);
    const checkout = checkoutRes.json.mock.calls[0][0].checkout
      || checkoutRes.json.mock.calls[0][0].data;

    const signed = wayforpayService.buildCheckoutPayload({
      type: 'pro',
      plan: 'monthly',
      orderReference: checkout.orderReference,
      orderDate: checkout.orderDate,
      dateNext: checkout.dateNext,
      amount: listed.amount,
    });

    expect(listed.amount).toBe(MONTHLY_UAH);
    expect(checkout.amount).toBe(MONTHLY_UAH);
    expect(checkout.currency).toBe('UAH');
    expect(signed.amount).toBe(MONTHLY_UAH);
    expect(signed.currency).toBe('UAH');
    expect(orderService.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ amount: MONTHLY_UAH, currency: 'UAH' })
    );
  });
});
