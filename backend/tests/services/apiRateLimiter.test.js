process.env.VALID_DOMAINS = 'hide-mail.org';

const { RATE_LIMITS } = require('../../services/apiRateLimiter');

const perMinute = ({ requests, windowSeconds }) => (requests / windowSeconds) * 60;

describe('apiRateLimiter limits', () => {
  it('throttles license key checks harder than ordinary endpoints', () => {
    expect(perMinute(RATE_LIMITS.licenseValidate))
      .toBeLessThan(perMinute(RATE_LIMITS.default));
  });

  it('keeps order lookups in a separate bucket from license key checks', () => {
    // Sharing a bucket would let key guessing lock a paying customer out of collecting
    // the key they just bought.
    expect(RATE_LIMITS.orderLookup).not.toBe(RATE_LIMITS.licenseValidate);
    expect(perMinute(RATE_LIMITS.orderLookup))
      .toBeGreaterThan(perMinute(RATE_LIMITS.licenseValidate));
  });
});
