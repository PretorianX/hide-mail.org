/**
 * USD list price × WayForPay USD rate, then round other currencies down.
 * Charge: floor to 10 UAH. Display: floor to cents.
 */

process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.PRO_PRICE_MONTHLY_USD = '3.49';
process.env.PRO_PRICE_YEARLY_USD = '24.99';
process.env.API_PRICE_MONTHLY_USD = '7.99';

const pricingService = require('../../services/pricingService');

describe('pricingService', () => {
  describe('uahFromUsd', () => {
    it('returns an exact multiple of 10 unchanged', () => {
      expect(pricingService.uahFromUsd(10, 10)).toBe(100);
      expect(pricingService.uahFromUsd(10, 11)).toBe(110);
    });

    it('floors just below the next 10 UAH step', () => {
      expect(pricingService.uahFromUsd(10, 10.9)).toBe(100);
      expect(pricingService.uahFromUsd(3.49, 41.5)).toBe(140);
    });

    it('floors an exact-but-for-a-fraction step down, not to nearest', () => {
      // 3.49 * 42.694 = 149.00206… which would round-nearest to 150, but we floor to 140.
      expect(pricingService.uahFromUsd(3.49, 42.694)).toBe(140);
    });
  });

  describe('displayAmount', () => {
    it('floors a non-UAH conversion to cents', () => {
      // 3.49 * (41.5 / 45.2) = 3.204424… → 3.20
      expect(pricingService.displayAmount(3.49, 41.5, 45.2)).toBe(3.2);
    });

    it('floors just below the next cent rather than rounding', () => {
      expect(pricingService.displayAmount(1, 1.009, 1)).toBe(1);
    });
  });

  describe('quotePlan', () => {
    const rates = { USD: 41.5, EUR: 45.2 };

    it('derives monthly Pro UAH from the USD list price and USD rate', () => {
      expect(pricingService.quotePlan('pro', 'monthly', rates)).toEqual({
        usd: 3.49,
        amountUah: 140,
        currency: 'UAH',
      });
    });

    it('derives yearly and API amounts from their own USD prices', () => {
      expect(pricingService.quotePlan('pro', 'yearly', rates).amountUah).toBe(1030);
      expect(pricingService.quotePlan('api', 'monthly', rates).amountUah).toBe(330);
    });
  });

  describe('checkoutAlternative', () => {
    const rates = { USD: 41.5, EUR: 45.2, GBP: 52.1 };

    it('sends EUR only when the client asked for EUR', () => {
      expect(pricingService.checkoutAlternative(3.49, rates, 'eur')).toEqual({
        alternativeCurrency: 'EUR',
        alternativeAmount: 3.2,
      });
    });

    it('sends the USD list price for every other display currency', () => {
      expect(pricingService.checkoutAlternative(3.49, rates, 'GBP')).toEqual({
        alternativeCurrency: 'USD',
        alternativeAmount: 3.49,
      });
      expect(pricingService.checkoutAlternative(3.49, rates, 'UAH')).toEqual({
        alternativeCurrency: 'USD',
        alternativeAmount: 3.49,
      });
    });
  });
});
