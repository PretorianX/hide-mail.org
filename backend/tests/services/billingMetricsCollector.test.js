process.env.VALID_DOMAINS = process.env.VALID_DOMAINS || 'hide-mail.org';

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../services/redisService', () => ({
  client: {
    scan: jest.fn(),
    mget: jest.fn(),
  },
}));

jest.mock('../../services/metricsService', () => ({
  licensesActive: { set: jest.fn(), reset: jest.fn() },
  apiKeysActive: { set: jest.fn() },
  billingOrders: { set: jest.fn(), reset: jest.fn() },
  billingCollectorLastSuccessTimestampSeconds: { set: jest.fn() },
  billingCollectorErrorsTotal: { inc: jest.fn() },
}));

const redisService = require('../../services/redisService');
const metrics = require('../../services/metricsService');
const logger = require('../../utils/logger');
const collector = require('../../services/billingMetricsCollector');

const HOUR = 60 * 60 * 1000;

const license = (type, plan, offsetMs = HOUR) => ({
  key: `HM-${type}-${plan}`,
  type,
  plan,
  status: 'active',
  expiresAt: Date.now() + offsetMs,
});

/**
 * Drives the mocked SCAN cursor: each pattern yields its keys in one page, and MGET
 * returns whatever the fixture stored under those keys.
 */
const givenRedis = (store) => {
  redisService.client.scan.mockImplementation(async (cursor, _match, pattern) => {
    const prefix = pattern.replaceAll('*', '');
    const keys = Object.keys(store).filter((key) => key.startsWith(prefix));
    return ['0', keys];
  });
  redisService.client.mget.mockImplementation(async (keys) =>
    keys.map((key) => (store[key] === null ? null : JSON.stringify(store[key])))
  );
};

const gaugeValue = (gauge, labels) => {
  const call = [...gauge.set.mock.calls].reverse().find(
    ([actual]) => JSON.stringify(actual) === JSON.stringify(labels)
  );
  return call ? call[1] : undefined;
};

describe('billingMetricsCollector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    collector.stop();
  });

  afterAll(() => {
    collector.stop();
  });

  it('counts active licenses per type and plan', async () => {
    givenRedis({
      'license:a': license('pro', 'monthly'),
      'license:b': license('pro', 'monthly'),
      'license:c': license('pro', 'yearly'),
      'license:d': license('api', 'monthly'),
    });

    await collector.collectOnce();

    expect(gaugeValue(metrics.licensesActive, { type: 'pro', plan: 'monthly' })).toBe(2);
    expect(gaugeValue(metrics.licensesActive, { type: 'pro', plan: 'yearly' })).toBe(1);
    expect(gaugeValue(metrics.licensesActive, { type: 'api', plan: 'monthly' })).toBe(1);
  });

  it('reports zero for plans nobody is subscribed to instead of dropping the series', async () => {
    givenRedis({ 'license:a': license('pro', 'monthly') });

    await collector.collectOnce();

    expect(metrics.licensesActive.reset).toHaveBeenCalled();
    expect(gaugeValue(metrics.licensesActive, { type: 'pro', plan: 'yearly' })).toBe(0);
    expect(gaugeValue(metrics.licensesActive, { type: 'api', plan: 'monthly' })).toBe(0);
  });

  it('excludes expired and revoked licenses from the active count', async () => {
    givenRedis({
      'license:live': license('pro', 'monthly'),
      'license:expired': license('pro', 'monthly', -HOUR),
      'license:revoked': { ...license('pro', 'monthly'), status: 'revoked' },
    });

    await collector.collectOnce();

    expect(gaugeValue(metrics.licensesActive, { type: 'pro', plan: 'monthly' })).toBe(1);
  });

  it('counts only API keys that have not expired', async () => {
    givenRedis({
      'api_key:live': { licenseKey: 'HM-1', type: 'api', expiresAt: Date.now() + HOUR },
      'api_key:stale': { licenseKey: 'HM-2', type: 'api', expiresAt: Date.now() - HOUR },
    });

    await collector.collectOnce();

    expect(metrics.apiKeysActive.set).toHaveBeenCalledWith(1);
  });

  it('splits orders by status and keeps both statuses visible', async () => {
    givenRedis({
      'order:1': { id: '1', status: 'pending' },
      'order:2': { id: '2', status: 'pending' },
      'order:3': { id: '3', status: 'paid' },
    });

    await collector.collectOnce();

    expect(gaugeValue(metrics.billingOrders, { status: 'pending' })).toBe(2);
    expect(gaugeValue(metrics.billingOrders, { status: 'paid' })).toBe(1);
  });

  it('does not confuse license order indexes with checkout orders', async () => {
    givenRedis({
      'order:1': { id: '1', status: 'paid' },
      'billing:order:1': { id: 'index', status: 'pending' },
    });

    await collector.collectOnce();

    expect(gaugeValue(metrics.billingOrders, { status: 'paid' })).toBe(1);
    expect(gaugeValue(metrics.billingOrders, { status: 'pending' })).toBe(0);
  });

  it('skips keys that expire between the scan and the read', async () => {
    givenRedis({
      'license:a': license('pro', 'monthly'),
      'license:gone': null,
    });

    await collector.collectOnce();

    expect(gaugeValue(metrics.licensesActive, { type: 'pro', plan: 'monthly' })).toBe(1);
  });

  it('walks every SCAN page before publishing', async () => {
    redisService.client.scan
      .mockResolvedValueOnce(['7', ['license:a']])
      .mockResolvedValueOnce(['0', ['license:b']])
      .mockResolvedValue(['0', []]);
    redisService.client.mget.mockImplementation(async (keys) =>
      keys.map(() => JSON.stringify(license('pro', 'monthly')))
    );

    await collector.collectOnce();

    expect(gaugeValue(metrics.licensesActive, { type: 'pro', plan: 'monthly' })).toBe(2);
  });

  it('publishes a success timestamp after a clean run', async () => {
    givenRedis({});

    await collector.collectOnce();

    expect(metrics.billingCollectorLastSuccessTimestampSeconds.set).toHaveBeenCalledWith(
      expect.any(Number)
    );
  });

  it('counts a failure and stays quiet when Redis is unavailable', async () => {
    redisService.client.scan.mockRejectedValue(new Error('Redis down'));

    await expect(collector.runSafely()).resolves.toBeUndefined();

    expect(metrics.billingCollectorErrorsTotal.inc).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalled();
    expect(metrics.billingCollectorLastSuccessTimestampSeconds.set).not.toHaveBeenCalled();
  });

  it('schedules a repeating collection that cannot hold the process open', () => {
    givenRedis({});

    const timer = collector.start(30);

    expect(timer).toBe(collector.start(30));
    expect(typeof timer.unref).toBe('function');
    collector.stop();
  });
});
