const { createDnsCache } = require('../../../services/mailGrade/dnsCache');

describe('dnsCache', () => {
  it('returns cached values within TTL and refreshes after', async () => {
    let calls = 0;
    const cache = createDnsCache({ ttlMs: 50, now: () => Date.now() });
    const loader = async () => {
      calls += 1;
      return `v${calls}`;
    };

    await expect(cache.get('k', loader)).resolves.toBe('v1');
    await expect(cache.get('k', loader)).resolves.toBe('v1');
    expect(calls).toBe(1);

    await new Promise((resolve) => setTimeout(resolve, 60));
    await expect(cache.get('k', loader)).resolves.toBe('v2');
    expect(calls).toBe(2);
  });
});
