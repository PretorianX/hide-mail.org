process.env.VALID_DOMAINS = 'hide-mail.org';

const accountService = require('../../../services/outbound/accountService');
const licenseService = require('../../../services/licenseService');
const redisService = require('../../../services/redisService');

describe('outbound accountService', () => {
  beforeEach(async () => {
    redisService.client.data = {};
  });

  describe('createAccount / listAccounts', () => {
    it('creates an account and lists it', async () => {
      const created = await accountService.createAccount({ label: 'Acme', days: 30 });
      const accounts = await accountService.listAccounts();
      expect(accounts.find((a) => a.accountId === created.accountId)).toBeTruthy();
    });

    it('omits an account whose license already expired from the index', async () => {
      const created = await accountService.createAccount({ label: 'Gone', days: 1 });
      // simulate Redis TTL reap by deleting the license key directly
      await redisService.client.del(`license:${created.key}`);
      const accounts = await accountService.listAccounts();
      expect(accounts.find((a) => a.accountId === created.accountId)).toBeUndefined();
    });
  });

  describe('getAccountByKey', () => {
    it('rejects a non-outbound license type', async () => {
      const proLicense = await licenseService.createLicense({ type: 'pro', plan: 'monthly', orderReference: 'o1', ttlSeconds: 86400 });
      expect(await accountService.getAccountByKey(proLicense.key)).toBeNull();
    });

    it('returns the license for an active outbound key', async () => {
      const created = await accountService.createAccount({ label: 'Acme', days: 30 });
      const found = await accountService.getAccountByKey(created.key);
      expect(found.accountId).toBe(created.accountId);
    });
  });

  describe('extendAccount', () => {
    it('extends the account license expiry', async () => {
      const created = await accountService.createAccount({ label: 'Acme', days: 1 });
      const extended = await accountService.extendAccount({ key: created.key, days: 10 });
      expect(extended.expiresAt).toBeGreaterThan(created.expiresAt);
    });
  });

  describe('accountId -> licenseKey index', () => {
    it('writes outbound:account:<accountId>:licenseKey so domain code can resolve the license by accountId', async () => {
      const created = await accountService.createAccount({ label: 'Acme', days: 30 });

      const indexed = await redisService.client.get(`outbound:account:${created.accountId}:licenseKey`);

      expect(indexed).toBe(created.key);
    });
  });
});
