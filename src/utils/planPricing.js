/**
 * Display conversion from the USD list price. The charged amount is always the
 * UAH figure the API quoted — the client must not invent a charge.
 */

export const DISPLAY_CURRENCY_KEY = 'hidemail.displayCurrency';

export const floorToCents = (value) => Math.floor(value * 100) / 100;

export const displayAmount = (usdAmount, usdRate, toRate) =>
  floorToCents(usdAmount * (usdRate / toRate));

export const displayCurrencies = (rates) => {
  const others = Object.keys(rates || {}).filter((code) => code !== 'USD').sort();
  return ['USD', ...others, 'UAH'];
};

export const formatDisplayAmount = (amount, currency) => {
  if (currency === 'USD') {
    return `$${Number(amount).toFixed(2)}`;
  }
  if (currency === 'UAH') {
    return `${amount} UAH`;
  }
  return `${Number(amount).toFixed(2)} ${currency}`;
};

export const headlinePrice = (plan, displayCurrency, fx) => {
  if (!plan) {
    return '';
  }
  if (displayCurrency === 'UAH') {
    return formatDisplayAmount(plan.amount, 'UAH');
  }
  if (displayCurrency === 'USD' || !fx?.rates?.[displayCurrency]) {
    return formatDisplayAmount(plan.usd, 'USD');
  }
  return formatDisplayAmount(
    displayAmount(plan.usd, fx.usdRate, fx.rates[displayCurrency]),
    displayCurrency
  );
};

export const chargedNote = (plan) => `charged as ${plan.amount} UAH`;

export const priceLabel = (plan, displayCurrency, period, fx) => {
  if (!plan) {
    return '—';
  }
  return `${headlinePrice(plan, displayCurrency, fx)} ${period} (${plan.amount} UAH)`;
};

export const readStoredCurrency = () => {
  try {
    return localStorage.getItem(DISPLAY_CURRENCY_KEY) || 'USD';
  } catch {
    return 'USD';
  }
};

export const storeCurrency = (code) => {
  localStorage.setItem(DISPLAY_CURRENCY_KEY, code);
};
