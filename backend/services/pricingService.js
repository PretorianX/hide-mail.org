/**
 * Derive the UAH charge and foreign-currency display from the USD list price
 * and WayForPay RATES (hryvnia per 1 unit of that currency).
 */

const config = require('../config/config');

const USD_KEYS = {
  pro: { monthly: 'monthlyUsd', yearly: 'yearlyUsd' },
  api: { monthly: 'apiUsd' },
};

const usdPrice = (type, plan) => {
  const key = USD_KEYS[type] && USD_KEYS[type][plan];
  if (!key) {
    throw new Error(`Unsupported ${type} plan: ${plan}`);
  }
  return config.billing[key];
};

// Charge amount is floored to 10 UAH so the shopper is never charged more than the USD quote.
const uahFromUsd = (usdAmount, usdRate) => Math.floor((usdAmount * usdRate) / 10) * 10;

// Display amounts in non-UAH currencies are floored to cents, never rounded up.
const displayAmount = (usdAmount, fromUsdRate, toRate) =>
  Math.floor(usdAmount * (fromUsdRate / toRate) * 100) / 100;

const quotePlan = (type, plan, rates) => {
  const usd = usdPrice(type, plan);
  return {
    usd,
    amountUah: uahFromUsd(usd, rates.USD),
    currency: 'UAH',
  };
};

// WayForPay alternativeAmount accepts only USD and EUR. Other display currencies still send USD.
const checkoutAlternative = (usd, rates, displayCurrency) => {
  const ccy = typeof displayCurrency === 'string' ? displayCurrency.toUpperCase() : '';
  if (ccy === 'EUR' && Number.isFinite(Number(rates.EUR)) && Number(rates.EUR) > 0) {
    return {
      alternativeCurrency: 'EUR',
      alternativeAmount: displayAmount(usd, rates.USD, rates.EUR),
    };
  }
  return {
    alternativeCurrency: 'USD',
    alternativeAmount: usd,
  };
};

module.exports = {
  uahFromUsd,
  displayAmount,
  quotePlan,
  checkoutAlternative,
};
