/**
 * Subscription state gauges.
 *
 * Counters tell us how many payments happened; they cannot tell us how many people are
 * paying right now, because licenses simply expire out of Redis. This collector walks the
 * license, API key and order keys on a timer and publishes the current totals.
 */

const redisService = require('./redisService');
const licenseService = require('./licenseService');
const metrics = require('./metricsService');
const config = require('../config/config');
const logger = require('../utils/logger');

const LICENSE_PATTERN = 'license:*';
const API_KEY_PATTERN = 'api_key:*';
const ORDER_PATTERN = 'order:*';

const SCAN_COUNT = 500;
const READ_CHUNK = 100;

// Seeded so a plan that nobody bought this month still reports 0 instead of dropping out
// of the dashboard.
const TRACKED_PLANS = [
  { type: 'pro', plan: 'monthly' },
  { type: 'pro', plan: 'yearly' },
  { type: 'api', plan: 'monthly' },
];

const TRACKED_ORDER_STATUSES = ['pending', 'paid'];

const scanKeys = async (pattern) => {
  const keys = [];
  let cursor = '0';
  do {
    const [next, batch] = await redisService.client.scan(
      cursor,
      'MATCH',
      pattern,
      'COUNT',
      SCAN_COUNT
    );
    cursor = next;
    keys.push(...batch);
  } while (cursor !== '0');
  return keys;
};

/**
 * Keys can expire between the scan and the read, which is why missing values are skipped
 * rather than treated as an error.
 */
const readRecords = async (keys) => {
  const records = [];
  for (let i = 0; i < keys.length; i += READ_CHUNK) {
    const values = await redisService.client.mget(keys.slice(i, i + READ_CHUNK));
    values.forEach((raw) => {
      if (raw) {
        records.push(JSON.parse(raw));
      }
    });
  }
  return records;
};

const countBy = (records, keyOf) => {
  const counts = new Map();
  records.forEach((record) => {
    const key = keyOf(record);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return counts;
};

const collectLicenses = async () => {
  const licenses = (await readRecords(await scanKeys(LICENSE_PATTERN))).filter(
    licenseService.isActive
  );
  const counts = countBy(licenses, (license) => `${license.type}|${license.plan}`);

  metrics.licensesActive.reset();
  TRACKED_PLANS.forEach(({ type, plan }) => {
    metrics.licensesActive.set({ type, plan }, counts.get(`${type}|${plan}`) || 0);
  });
  counts.forEach((count, key) => {
    const [type, plan] = key.split('|');
    metrics.licensesActive.set({ type, plan }, count);
  });
};

const collectApiKeys = async () => {
  const now = Date.now();
  const records = await readRecords(await scanKeys(API_KEY_PATTERN));
  metrics.apiKeysActive.set(records.filter((record) => record.expiresAt > now).length);
};

const collectOrders = async () => {
  const orders = await readRecords(await scanKeys(ORDER_PATTERN));
  const counts = countBy(orders, (order) => order.status);

  metrics.billingOrders.reset();
  TRACKED_ORDER_STATUSES.forEach((status) => {
    metrics.billingOrders.set({ status }, counts.get(status) || 0);
  });
  counts.forEach((count, status) => {
    metrics.billingOrders.set({ status }, count);
  });
};

const collectOnce = async () => {
  await collectLicenses();
  await collectApiKeys();
  await collectOrders();
  metrics.billingCollectorLastSuccessTimestampSeconds.set(Math.floor(Date.now() / 1000));
};

const runSafely = async () => {
  try {
    await collectOnce();
  } catch (error) {
    metrics.billingCollectorErrorsTotal.inc();
    logger.error('Billing metrics: collection failed', error);
  }
};

let timer = null;

const start = (intervalSeconds = config.metrics.billingCollectorIntervalSeconds) => {
  if (timer) {
    return timer;
  }
  runSafely();
  timer = setInterval(runSafely, intervalSeconds * 1000);
  // The collector must never be the reason the process stays alive.
  timer.unref();
  logger.info(`Billing metrics collector running every ${intervalSeconds}s`);
  return timer;
};

const stop = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
};

module.exports = {
  collectOnce,
  runSafely,
  start,
  stop,
};
