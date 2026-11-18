process.env.VALID_DOMAINS = 'hide-mail.org';

const { isOriginAllowed } = require('../../services/originVerifier');
const { createDnsCache } = require('../../services/mailGrade/dnsCache');

describe('originVerifier.isOriginAllowed', () => {
  it('matches exact origins and valid wildcard subdomains', () => {
    expect(isOriginAllowed('https://hide-mail.org', ['https://hide-mail.org'])).toBe(true);
    expect(isOriginAllowed('https://sub.example.com', ['*.example.com'])).toBe(true);
    expect(isOriginAllowed('https://example.com', ['*.example.com'])).toBe(true);
  });

  it('rejects lookalike suffix domains for wildcard rules', () => {
    expect(isOriginAllowed('https://notexample.com', ['*.example.com'])).toBe(false);
    expect(isOriginAllowed('https://evil-example.com', ['*.example.com'])).toBe(false);
  });
});

describe('mailGrade dnsCache', () => {
  it('evicts oldest entries when maxEntries is reached', async () => {
    let now = 1000;
    const cache = createDnsCache({ ttlMs: 60000, maxEntries: 2, now: () => now });
    const loaderA = jest.fn().mockResolvedValue('a');
    const loaderB = jest.fn().mockResolvedValue('b');
    const loaderC = jest.fn().mockResolvedValue('c');

    await cache.get('a', loaderA);
    await cache.get('b', loaderB);
    await cache.get('c', loaderC);

    // 'a' should have been evicted; 'b' and 'c' remain cached
    await cache.get('b', loaderB);
    await cache.get('c', loaderC);
    await cache.get('a', loaderA);

    expect(loaderB).toHaveBeenCalledTimes(1);
    expect(loaderC).toHaveBeenCalledTimes(1);
    expect(loaderA).toHaveBeenCalledTimes(2);
  });
});
