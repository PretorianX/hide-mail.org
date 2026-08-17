/**
 * WayForPay HMAC-MD5 signatures and checkout/webhook handling.
 * Official purchase example: wiki.wayforpay.com/en/view/852102
 */

const crypto = require('crypto');

const TEST_SECRET = 'dhkq3vUi94{Z!5frxs(02ML';

describe('wayforpayService', () => {
  let wayforpayService;

  beforeEach(() => {
    jest.resetModules();
    process.env.VALID_DOMAINS = 'hide-mail.org';
    process.env.WAYFORPAY_MERCHANT_ACCOUNT = 'test_merchant';
    process.env.WAYFORPAY_SECRET_KEY = TEST_SECRET;
    process.env.WAYFORPAY_DOMAIN_NAME = 'www.market.ua';
    process.env.WAYFORPAY_SERVICE_URL = 'https://hide-mail.org/api/billing/webhook';
    process.env.WAYFORPAY_RETURN_URL = 'https://hide-mail.org/?pro=return';
    process.env.PRO_PRICE_MONTHLY_UAH = '149';
    process.env.PRO_PRICE_YEARLY_UAH = '1079';
    process.env.API_PRICE_MONTHLY_UAH = '349';
    wayforpayService = require('../../services/wayforpayService');
  });

  describe('signPurchase', () => {
    it('HMAC-MD5s merchantAccount;domain;order;date;amount;currency;names;counts;prices', () => {
      // Field order from wiki.wayforpay.com/en/view/852102.
      // The wiki's Cyrillic sample hash does not match UTF-8 HMAC-MD5; ASCII fixture is the spec.
      const payload = {
        merchantAccount: 'test_merchant',
        merchantDomainName: 'www.market.ua',
        orderReference: 'DH783023',
        orderDate: 1415379863,
        amount: 1547.36,
        currency: 'UAH',
        productName: ['CPU', 'RAM'],
        productCount: [1, 1],
        productPrice: [1000, 547.36],
      };

      expect(wayforpayService.signPurchase(payload, TEST_SECRET)).toBe(
        '146a6f3f2400c0453095e2a49eb96991'
      );
    });
  });

  describe('verifyCallbackSignature', () => {
    it('accepts a callback whose merchantSignature matches HMAC-MD5 of callback fields', () => {
      const callback = {
        merchantAccount: 'test_merchant',
        orderReference: 'DH783023',
        amount: 1547.36,
        currency: 'UAH',
        authCode: '541963',
        cardPan: '41****8217',
        transactionStatus: 'Approved',
        reasonCode: '1100',
      };
      const signed = {
        ...callback,
        merchantSignature: wayforpayService.signCallback(callback, TEST_SECRET),
      };

      expect(wayforpayService.verifyCallbackSignature(signed, TEST_SECRET)).toBe(true);
    });

    it('rejects a callback with a tampered signature', () => {
      const callback = {
        merchantAccount: 'test_merchant',
        orderReference: 'DH783023',
        amount: 149,
        currency: 'UAH',
        authCode: '541963',
        cardPan: '41****8217',
        transactionStatus: 'Approved',
        reasonCode: '1100',
        merchantSignature: 'deadbeef',
      };

      expect(wayforpayService.verifyCallbackSignature(callback, TEST_SECRET)).toBe(false);
    });
  });

  describe('buildCheckoutPayload', () => {
    it('returns a signed monthly recurring purchase payload in UAH', () => {
      const payload = wayforpayService.buildCheckoutPayload({
        type: 'pro',
        plan: 'monthly',
        orderReference: 'pro-monthly-test',
        orderDate: 1700000000,
        dateNext: '18.09.2026',
      });

      expect(payload.merchantAccount).toBe('test_merchant');
      expect(payload.merchantDomainName).toBe('www.market.ua');
      expect(payload.currency).toBe('UAH');
      expect(payload.amount).toBe(149);
      expect(payload.productName).toEqual(['Hide Mail Pro Monthly']);
      expect(payload.productCount).toEqual([1]);
      expect(payload.productPrice).toEqual([149]);
      expect(payload.regularMode).toBe('monthly');
      expect(payload.regularOn).toBe(1);
      expect(payload.regularBehavior).toBe('preset');
      expect(payload.dateNext).toBe('18.09.2026');
      expect(payload.serviceUrl).toBe('https://hide-mail.org/api/billing/webhook');
      expect(payload.returnUrl).toContain('orderReference=pro-monthly-test');
      expect(payload.paymentUrl).toBe('https://secure.wayforpay.com/pay');
      expect(payload.merchantSignature).toBe(
        wayforpayService.signPurchase(payload, TEST_SECRET)
      );
    });

    it('returns a signed yearly recurring purchase payload in UAH', () => {
      const payload = wayforpayService.buildCheckoutPayload({
        type: 'pro',
        plan: 'yearly',
        orderReference: 'pro-yearly-test',
        orderDate: 1700000000,
        dateNext: '17.08.2027',
      });

      expect(payload.amount).toBe(1079);
      expect(payload.productName).toEqual(['Hide Mail Pro Yearly']);
      expect(payload.regularMode).toBe('yearly');
    });

    it('rejects an unknown plan instead of substituting another product', () => {
      expect(() =>
        wayforpayService.buildCheckoutPayload({
          type: 'pro',
          plan: 'lifetime',
          orderReference: 'x',
          orderDate: 1,
          dateNext: '01.01.2027',
        })
      ).toThrow(/unsupported pro plan/i);
    });

    it('prices an API order from the API tariff, not the Pro tariff', () => {
      const payload = wayforpayService.buildCheckoutPayload({
        type: 'api',
        plan: 'monthly',
        orderReference: 'api-monthly-test',
        orderDate: 1700000000,
        dateNext: '18.09.2026',
      });

      expect(payload.amount).toBe(349);
      expect(payload.productPrice).toEqual([349]);
      expect(payload.productName).toEqual(['Hide Mail API Monthly']);
    });

    it('rejects a yearly API order because the API tariff is monthly only', () => {
      expect(() => wayforpayService.resolveProduct('api', 'yearly')).toThrow(/unsupported api plan/i);
    });
  });

  describe('classifyTransactionStatus', () => {
    it('activates on Approved', () => {
      expect(wayforpayService.classifyTransactionStatus('Approved')).toBe('activate');
    });

    it('revokes on Refunded and Voided', () => {
      expect(wayforpayService.classifyTransactionStatus('Refunded')).toBe('revoke');
      expect(wayforpayService.classifyTransactionStatus('Voided')).toBe('revoke');
    });

    it('ignores Declined, Expired, and in-progress statuses', () => {
      expect(wayforpayService.classifyTransactionStatus('Declined')).toBe('ignore');
      expect(wayforpayService.classifyTransactionStatus('Expired')).toBe('ignore');
      expect(wayforpayService.classifyTransactionStatus('Pending')).toBe('ignore');
      expect(wayforpayService.classifyTransactionStatus('InProcessing')).toBe('ignore');
      expect(wayforpayService.classifyTransactionStatus('WaitingAuthComplete')).toBe('ignore');
    });

    it('rejects unknown statuses instead of treating them as success', () => {
      expect(() => wayforpayService.classifyTransactionStatus('Mystery')).toThrow(
        /unsupported transactionStatus/i
      );
    });
  });

  describe('acknowledgeWebhook', () => {
    it('signs orderReference;status;time with HMAC-MD5', () => {
      const ack = wayforpayService.acknowledgeWebhook('DH783023', 1415379863, TEST_SECRET);
      const expected = crypto
        .createHmac('md5', TEST_SECRET)
        .update('DH783023;accept;1415379863', 'utf8')
        .digest('hex');

      expect(ack).toEqual({
        orderReference: 'DH783023',
        status: 'accept',
        time: 1415379863,
        signature: expected,
      });
    });
  });
});
