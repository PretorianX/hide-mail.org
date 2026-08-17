import { headlinePrice, chargedNote, priceLabel } from './planPricing';

const monthly = { id: 'monthly', amount: 149, usdDisplay: '4.99' };

describe('planPricing', () => {
  test('leads with the dollar figure', () => {
    expect(headlinePrice(monthly)).toBe('$4.99');
  });

  test('names the amount that actually leaves the card', () => {
    expect(chargedNote(monthly, 'UAH')).toBe('charged as 149 UAH');
  });

  test('combines both currencies for the comparison table', () => {
    expect(priceLabel(monthly, 'UAH', 'per month')).toBe('$4.99 per month (149 UAH)');
  });

  test('shows a placeholder while prices are still loading', () => {
    expect(priceLabel(undefined, 'UAH', 'per month')).toBe('—');
  });
});
