process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.OUTBOUND_KEY_ENCRYPTION_SECRET = 'test-secret-for-outbound-domain-keys';
process.env.OUTBOUND_RATE_PER_MINUTE = '5';

const redisService = require('../../../services/redisService');
const accountRateLimiter = require('../../../services/outbound/accountRateLimiter');

describe('outbound accountRateLimiter', () => {
  beforeEach(() => {
    redisService.client.data = {};
  });

  it('allows N calls under the default limit within one minute', async () => {
    for (let i = 0; i < 5; i += 1) {
      await expect(accountRateLimiter.checkAndIncrement('acct-1')).resolves.toMatchObject({
        allowed: true,
        limit: 5,
      });
    }
  });

  it('refuses the (default+1)th call with retryAfterSeconds between 1 and 60', async () => {
    for (let i = 0; i < 5; i += 1) {
      await accountRateLimiter.checkAndIncrement('acct-1');
    }

    const refused = await accountRateLimiter.checkAndIncrement('acct-1');
    expect(refused.allowed).toBe(false);
    expect(refused.limit).toBe(5);
    expect(refused.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(refused.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('honors setOverride immediately', async () => {
    await accountRateLimiter.setOverride('acct-1', 2);

    await expect(accountRateLimiter.checkAndIncrement('acct-1')).resolves.toMatchObject({
      allowed: true,
      limit: 2,
    });
    await expect(accountRateLimiter.checkAndIncrement('acct-1')).resolves.toMatchObject({
      allowed: true,
      limit: 2,
    });
    await expect(accountRateLimiter.checkAndIncrement('acct-1')).resolves.toMatchObject({
      allowed: false,
      limit: 2,
    });
  });
});
