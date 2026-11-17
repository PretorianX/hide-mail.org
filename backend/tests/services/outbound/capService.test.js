process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.OUTBOUND_KEY_ENCRYPTION_SECRET = 'test-secret-for-outbound-domain-keys';

const redisService = require('../../../services/redisService');
const capService = require('../../../services/outbound/capService');

const META_PREFIX = 'outbound:domain:meta:';

const writeMeta = async (domain, { dailyLimit }) => {
  await redisService.client.set(
    `${META_PREFIX}${domain}`,
    JSON.stringify({
      accountId: 'acct-1',
      domain,
      state: 'verified',
      suspended: false,
      dailyLimit,
    })
  );
};

const todayKey = (domain) => {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  return `outbound:cap:${domain}:${yyyy}${mm}${dd}`;
};

describe('outbound capService', () => {
  beforeEach(() => {
    redisService.client.data = {};
  });

  describe('checkAndIncrement', () => {
    it('allows the first message under a limit of 5 with remaining 4', async () => {
      await writeMeta('mail.example.com', { dailyLimit: 5 });

      const result = await capService.checkAndIncrement('mail.example.com');

      expect(result).toMatchObject({ allowed: true, remaining: 4 });
      expect(typeof result.resetAt).toBe('number');
      expect(await redisService.client.get(todayKey('mail.example.com'))).toBe('1');
    });

    it('refuses the 6th message and leaves the counter at 5', async () => {
      await writeMeta('mail.example.com', { dailyLimit: 5 });

      for (let i = 0; i < 5; i += 1) {
        await expect(capService.checkAndIncrement('mail.example.com')).resolves.toMatchObject({
          allowed: true,
        });
      }

      const refused = await capService.checkAndIncrement('mail.example.com');
      expect(refused.allowed).toBe(false);
      expect(refused.remaining).toBe(0);
      expect(await redisService.client.get(todayKey('mail.example.com'))).toBe('5');
    });

    it('always allows unlimited domains while still counting', async () => {
      await writeMeta('mail.example.com', { dailyLimit: null });

      for (let i = 0; i < 3; i += 1) {
        await expect(capService.checkAndIncrement('mail.example.com')).resolves.toMatchObject({
          allowed: true,
          remaining: null,
        });
      }

      expect(await redisService.client.get(todayKey('mail.example.com'))).toBe('3');
    });
  });

  describe('getDailyLimit / setDailyLimit', () => {
    it('reads and writes the meta dailyLimit field', async () => {
      await writeMeta('mail.example.com', { dailyLimit: 1000 });

      await expect(capService.getDailyLimit('mail.example.com')).resolves.toBe(1000);

      await capService.setDailyLimit('mail.example.com', 50);
      await expect(capService.getDailyLimit('mail.example.com')).resolves.toBe(50);

      await capService.setDailyLimit('mail.example.com', null);
      await expect(capService.getDailyLimit('mail.example.com')).resolves.toBeNull();
    });
  });
});
