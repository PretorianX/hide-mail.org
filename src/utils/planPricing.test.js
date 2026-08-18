import {
  headlinePrice,
  chargedNote,
  priceLabel,
  displayAmount,
  displayCurrencies,
  floorToCents,
} from './planPricing';

const monthly = { id: 'monthly', amount: 140, usd: 3.49 };
const fx = { usdRate: 41.5, rates: { USD: 41.5, EUR: 45.2, GBP: 52.1 } };

describe('planPricing', () => {
  test('floors a conversion to cents rather than rounding', () => {
    expect(floorToCents(3.204424778761062)).toBe(3.2);
    expect(displayAmount(3.49, 41.5, 45.2)).toBe(3.2);
  });

  test('lists WayForPay rate codes plus UAH, with USD first', () => {
    expect(displayCurrencies(fx.rates)).toEqual(['USD', 'EUR', 'GBP', 'UAH']);
    expect(displayCurrencies({})).toEqual(['USD']);
  });

  test('leads with the selected display currency', () => {
    expect(headlinePrice(monthly, 'USD', fx)).toBe('$3.49');
    expect(headlinePrice(monthly, 'EUR', fx)).toBe('3.20 EUR');
    expect(headlinePrice(monthly, 'UAH', fx)).toBe('140 UAH');
  });

  test('names the amount that actually leaves the card', () => {
    expect(chargedNote(monthly)).toBe('charged as 140 UAH');
    expect(chargedNote({ ...monthly, amount: null })).toBe('UAH charge unavailable');
  });

  test('combines both currencies for the comparison table', () => {
    expect(priceLabel(monthly, 'USD', 'per month', fx)).toBe('$3.49 per month (140 UAH)');
    expect(priceLabel(monthly, 'EUR', 'per month', fx)).toBe('3.20 EUR per month (140 UAH)');
  });

  test('shows a placeholder while prices are still loading', () => {
    expect(priceLabel(undefined, 'USD', 'per month', fx)).toBe('—');
  });
});
