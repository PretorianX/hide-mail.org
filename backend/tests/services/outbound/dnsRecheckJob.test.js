process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.OUTBOUND_KEY_ENCRYPTION_SECRET = 'test-secret-for-outbound-domain-keys';

jest.mock('../../../services/outbound/domainService');
jest.mock('../../../utils/logger', () => ({
  error: jest.fn(),
  info: jest.fn(),
}));

const domainService = require('../../../services/outbound/domainService');
const redisService = require('../../../services/redisService');
const logger = require('../../../utils/logger');
const dnsRecheckJob = require('../../../services/outbound/dnsRecheckJob');

const GLOBAL_DOMAINS_INDEX = 'outbound:domains:index';

const addIndexedDomain = async ({ accountId, domain, state = 'verified' }) => {
  await redisService.client.sadd(GLOBAL_DOMAINS_INDEX, domain);
  await redisService.client.set(
    `outbound:domain:meta:${domain}`,
    JSON.stringify({ accountId, state })
  );
};

describe('outbound dnsRecheckJob', () => {
  beforeEach(() => {
    redisService.client.data = {};
    jest.clearAllMocks();
    delete process.env.OUTBOUND_DNS_RECHECK_SECONDS;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('runOnce', () => {
    it('checks every globally indexed domain with its owning account', async () => {
      await addIndexedDomain({ accountId: 'account-a', domain: 'a.example.com' });
      await addIndexedDomain({ accountId: 'account-b', domain: 'b.example.com' });
      domainService.checkDomain.mockResolvedValue({ state: 'verified' });

      const result = await dnsRecheckJob.runOnce();

      expect(domainService.checkDomain).toHaveBeenCalledTimes(2);
      expect(domainService.checkDomain).toHaveBeenCalledWith({
        accountId: 'account-a',
        domain: 'a.example.com',
      });
      expect(domainService.checkDomain).toHaveBeenCalledWith({
        accountId: 'account-b',
        domain: 'b.example.com',
      });
      expect(result).toEqual({ checked: 2, becameBroken: [] });
    });

    it('logs a failed domain and continues checking the rest', async () => {
      await addIndexedDomain({ accountId: 'account-a', domain: 'bad.example.com' });
      await addIndexedDomain({ accountId: 'account-b', domain: 'good.example.com' });
      domainService.checkDomain
        .mockRejectedValueOnce(new Error('DNS unavailable'))
        .mockResolvedValueOnce({ state: 'verified' });

      const result = await dnsRecheckJob.runOnce();

      expect(domainService.checkDomain).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ checked: 1, becameBroken: [] });
      expect(logger.error).toHaveBeenCalledWith(
        'Outbound DNS recheck failed for bad.example.com',
        expect.any(Error)
      );
    });

    it('returns only domains that became broken during this pass', async () => {
      await addIndexedDomain({
        accountId: 'account-a',
        domain: 'newly-broken.example.com',
        state: 'verified',
      });
      await addIndexedDomain({
        accountId: 'account-b',
        domain: 'already-broken.example.com',
        state: 'broken',
      });
      domainService.checkDomain.mockResolvedValue({ state: 'broken' });

      const result = await dnsRecheckJob.runOnce();

      expect(result).toEqual({
        checked: 2,
        becameBroken: ['newly-broken.example.com'],
      });
    });
  });

  describe('start', () => {
    it('schedules an unrefed hourly sweep and returns a stop function', () => {
      const timer = { unref: jest.fn() };
      const setIntervalSpy = jest.spyOn(global, 'setInterval').mockReturnValue(timer);
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval').mockImplementation(() => {});

      const stop = dnsRecheckJob.start();

      expect(setIntervalSpy).toHaveBeenCalledWith(dnsRecheckJob.runOnce, 3600 * 1000);
      expect(timer.unref).toHaveBeenCalledTimes(1);

      stop();
      expect(clearIntervalSpy).toHaveBeenCalledWith(timer);
    });

    it('uses OUTBOUND_DNS_RECHECK_SECONDS when configured', () => {
      process.env.OUTBOUND_DNS_RECHECK_SECONDS = '30';
      const timer = { unref: jest.fn() };
      const setIntervalSpy = jest.spyOn(global, 'setInterval').mockReturnValue(timer);

      dnsRecheckJob.start();

      expect(setIntervalSpy).toHaveBeenCalledWith(dnsRecheckJob.runOnce, 30 * 1000);
    });
  });
});
