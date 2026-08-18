process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.WAYFORPAY_MERCHANT_ACCOUNT = 'test_merchant';
process.env.WAYFORPAY_SECRET_KEY = 'dhkq3vUi94{Z!5frxs(02ML';
process.env.FX_CACHE_SECONDS = '7200';
process.env.FX_STALE_SECONDS = '86400';

const crypto = require('crypto');

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const OK_RATES = { USD: 41.5, EUR: 45.2, GBP: 52.1 };
const OK_BODY = {
  REASONCODE: 1100,
  REASON: 'OK',
  RATESDATE: 1519115604,
  RATES: OK_RATES,
};

const hmac = (account, orderDate) =>
  crypto.createHmac('md5', 'dhkq3vUi94{Z!5frxs(02ML')
    .update(`${account};${orderDate}`, 'utf8')
    .digest('hex');

describe('exchangeRateService', () => {
  let exchangeRateService;
  let logger;
  let now;

  beforeEach(() => {
    jest.resetModules();
    process.env.VALID_DOMAINS = 'hide-mail.org';
    process.env.WAYFORPAY_MERCHANT_ACCOUNT = 'test_merchant';
    process.env.WAYFORPAY_SECRET_KEY = 'dhkq3vUi94{Z!5frxs(02ML';
    process.env.FX_CACHE_SECONDS = '7200';
    process.env.FX_STALE_SECONDS = '86400';
    const redisService = require('../../services/redisService');
    redisService.client.data = {};
    now = 1_700_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    global.fetch = jest.fn();
    logger = require('../../utils/logger');
    logger.warn.mockClear();
    logger.info.mockClear();
    exchangeRateService = require('../../services/exchangeRateService');
  });

  afterEach(() => {
    Date.now.mockRestore();
  });

  const fetchOk = (body = OK_BODY) => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => body,
    });
  };

  const fetchFail = () => {
    global.fetch.mockRejectedValue(new Error('network down'));
  };

  it('HMAC-MD5s merchantAccount;orderDate for CURRENCY_RATES', async () => {
    fetchOk();
    await exchangeRateService.getRates();

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.wayforpay.com/api',
      expect.objectContaining({ method: 'POST' })
    );
    const sent = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(sent.transactionType).toBe('CURRENCY_RATES');
    expect(sent.merchantAccount).toBe('test_merchant');
    expect(sent.apiVersion).toBe('1');
    expect(sent.merchantSignature).toBe(hmac(sent.merchantAccount, sent.orderDate));
  });

  it('does not refetch while the cache is fresh', async () => {
    fetchOk();
    const first = await exchangeRateService.getRates();
    const second = await exchangeRateService.getRates();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(second.rates).toEqual(first.rates);
  });

  it('returns a stale-but-usable cache when fetch fails', async () => {
    fetchOk();
    await exchangeRateService.getRates();

    Date.now.mockReturnValue(now + 3 * 60 * 60 * 1000);
    fetchFail();
    const stale = await exchangeRateService.getRates();

    expect(stale.rates).toEqual(OK_RATES);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('throws RATE_UNAVAILABLE when cache is older than 24h and fetch fails', async () => {
    fetchOk();
    await exchangeRateService.getRates();

    Date.now.mockReturnValue(now + 25 * 60 * 60 * 1000);
    fetchFail();

    await expect(exchangeRateService.getRates()).rejects.toMatchObject({
      code: 'RATE_UNAVAILABLE',
      status: 503,
    });
  });

  it('rejects a response with a missing or non-positive USD rate', async () => {
    fetchOk({ REASONCODE: 1100, RATES: { EUR: 45.2 } });
    await expect(exchangeRateService.getRates()).rejects.toMatchObject({
      code: 'RATE_UNAVAILABLE',
    });

    fetchOk({ REASONCODE: 1100, RATES: { USD: 0 } });
    await expect(exchangeRateService.getRates()).rejects.toMatchObject({
      code: 'RATE_UNAVAILABLE',
    });

    fetchOk({ REASONCODE: 1100, RATES: {} });
    await expect(exchangeRateService.getRates()).rejects.toMatchObject({
      code: 'RATE_UNAVAILABLE',
    });
  });
});
