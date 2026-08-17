/**
 * Prices are quoted in US dollars because most visitors are outside Ukraine, but WayForPay
 * settles in hryvnia — the UAH figure is what actually leaves the card. Every dollar amount is
 * therefore paired with the charged amount so nobody is surprised by their bank statement.
 */

export const headlinePrice = (plan) => `$${plan.usdDisplay}`;

export const chargedNote = (plan, currency) => `charged as ${plan.amount} ${currency}`;

export const priceLabel = (plan, currency, period) => {
  if (!plan) {
    return '—';
  }
  return `${headlinePrice(plan)} ${period} (${plan.amount} ${currency})`;
};
