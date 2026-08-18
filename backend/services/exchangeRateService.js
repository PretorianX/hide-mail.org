/**
 * WayForPay CURRENCY_RATES, cached in Redis. No NBU or hardcoded fallback rate.
 */

const config = require('../config/config');
const redisService = require('./redisService');
const wayforpayService = require('./wayforpayService');
const metrics = require('./metricsService');
const logger = require('../utils/logger');
const { sanitizeForLog } = require('../utils/sanitize');

const WAYFORPAY_API_URL = 'https://api.wayforpay.com/api';
const CACHE_KEY = 'billing:fx:rates';

const rateUnavailable = (message) => {
  const error = new Error(message);
  error.code = 'RATE_UNAVAILABLE';
  error.status = 503;
  return error;
};

const isPositiveFinite = (value) => Number.isFinite(value) && value > 0;

const readCache = async () => {
  const raw = await redisService.client.get(CACHE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.fetchedAt !== 'number' || !parsed.rates) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const writeCache = async (payload) => {
  await redisService.client.set(CACHE_KEY, JSON.stringify(payload));
  await redisService.client.expire(CACHE_KEY, config.billing.fxStaleSeconds);
};

const parseRates = (body) => {
  if (!body || Number(body.REASONCODE) !== 1100) {
    throw new Error('CURRENCY_RATES not OK');
  }
  const rates = body.RATES;
  if (!rates || typeof rates !== 'object' || Object.keys(rates).length === 0) {
    throw new Error('CURRENCY_RATES missing RATES');
  }
  if (!isPositiveFinite(Number(rates.USD))) {
    throw new Error('CURRENCY_RATES missing USD');
  }
  return {
    rates,
    ratesDate: body.RATESDATE,
    fetchedAt: Date.now(),
  };
};

const fetchFromWayForPay = async () => {
  const merchantAccount = config.wayforpay.merchantAccount;
  if (!merchantAccount || !config.wayforpay.secretKey) {
    throw new Error('WayForPay merchant is not configured');
  }

  const orderDate = Math.floor(Date.now() / 1000);
  const merchantSignature = wayforpayService.hmacMd5(
    config.wayforpay.secretKey,
    `${merchantAccount};${orderDate}`
  );

  const response = await fetch(WAYFORPAY_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiVersion: '1',
      transactionType: 'CURRENCY_RATES',
      merchantAccount,
      orderDate,
      merchantSignature,
    }),
  });

  if (!response.ok) {
    throw new Error(`CURRENCY_RATES HTTP ${response.status}`);
  }

  const body = await response.json();
  return parseRates(body);
};

const getRates = async () => {
  const cache = await readCache();
  const ageMs = cache ? Date.now() - cache.fetchedAt : Number.POSITIVE_INFINITY;
  const freshMs = config.billing.fxCacheSeconds * 1000;
  const staleMs = config.billing.fxStaleSeconds * 1000;

  if (cache && ageMs < freshMs) {
    metrics.billingFxCacheHitsTotal.inc({ freshness: 'fresh' });
    return cache;
  }

  try {
    const fresh = await fetchFromWayForPay();
    await writeCache(fresh);
    metrics.billingFxUsdUah.set(Number(fresh.rates.USD));
    metrics.billingFxLastSuccessTimestampSeconds.set(Math.floor(Date.now() / 1000));
    logger.info(`Fetched WayForPay FX rates USD=${fresh.rates.USD}`);
    return fresh;
  } catch (error) {
    metrics.billingFxFetchErrorsTotal.inc();
    if (cache && ageMs < staleMs) {
      metrics.billingFxCacheHitsTotal.inc({ freshness: 'stale' });
      logger.warn(`Using stale WayForPay FX cache: ${sanitizeForLog(error.message)}`);
      return cache;
    }
    throw rateUnavailable('Currency rates are unavailable. Try again later.');
  }
};

module.exports = {
  getRates,
};
