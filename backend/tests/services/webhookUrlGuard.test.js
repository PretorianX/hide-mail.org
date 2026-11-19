const {
  validatePublicHttpsWebhookUrl,
  createPinnedLookup,
} = require('../../services/webhookUrlGuard');

describe('webhookUrlGuard', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('accepts a public HTTPS URL', async () => {
    const lookup = jest.fn().mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
    ]);

    await expect(
      validatePublicHttpsWebhookUrl('https://example.test/inbound', lookup)
    ).resolves.toEqual({ ok: true });
  });

  it('rejects localhost hostnames', async () => {
    const lookup = jest.fn();
    await expect(
      validatePublicHttpsWebhookUrl('https://localhost/webhook', lookup)
    ).rejects.toThrow(/invalid webhook url/i);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('rejects private IPv4 addresses', async () => {
    const lookup = jest.fn().mockResolvedValue([
      { address: '10.0.0.8', family: 4 },
    ]);

    await expect(
      validatePublicHttpsWebhookUrl('https://qa.internal.test/hook', lookup)
    ).rejects.toThrow(/invalid webhook url/i);
  });

  it('rejects loopback IPv6 addresses', async () => {
    const lookup = jest.fn().mockResolvedValue([
      { address: '::1', family: 6 },
    ]);

    await expect(
      validatePublicHttpsWebhookUrl('https://qa.example.test/hook', lookup)
    ).rejects.toThrow(/invalid webhook url/i);
  });

  it('rejects hex-encoded IPv4-mapped IPv6 loopback addresses', async () => {
    const lookup = jest.fn().mockResolvedValue([
      { address: '::ffff:7f00:1', family: 6 },
    ]);

    await expect(
      validatePublicHttpsWebhookUrl('https://qa.example.test/hook', lookup)
    ).rejects.toThrow(/invalid webhook url/i);
  });

  it.each([
    ['CGNAT', '100.64.0.1', 4],
    ['benchmarking', '198.18.0.1', 4],
    ['TEST-NET-1', '192.0.2.1', 4],
    ['TEST-NET-2', '198.51.100.1', 4],
    ['TEST-NET-3', '203.0.113.1', 4],
    ['multicast IPv4', '224.0.0.1', 4],
    ['reserved IPv4', '240.0.0.1', 4],
    ['multicast IPv6', 'ff02::1', 6],
    ['documentation IPv6', '2001:db8::1', 6],
    ['6to4 IPv6', '2002:7f00:1::', 6],
    ['NAT64 IPv6', '64:ff9b::10.0.0.1', 6],
    ['non-canonical loopback IPv6', '0:0:0:0:0:0:0:1', 6],
  ])('rejects %s (%s)', async (_label, address, family) => {
    const lookup = jest.fn().mockResolvedValue([{ address, family }]);
    await expect(
      validatePublicHttpsWebhookUrl('https://qa.example.test/hook', lookup)
    ).rejects.toThrow(/invalid webhook url/i);
  });

  it('createPinnedLookup pins validated public IP and rejects private IPs', async () => {
    const publicLookup = jest.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    const pinnedPublic = createPinnedLookup(publicLookup);

    await new Promise((resolve, reject) => {
      pinnedPublic('qa.example.test', {}, (err, address, family) => {
        if (err) return reject(err);
        expect(address).toBe('93.184.216.34');
        expect(family).toBe(4);
        resolve();
      });
    });

    const privateLookup = jest.fn().mockResolvedValue([{ address: '100.64.1.2', family: 4 }]);
    const pinnedPrivate = createPinnedLookup(privateLookup);

    await new Promise((resolve) => {
      pinnedPrivate('rebind.example.test', {}, (err) => {
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toMatch(/invalid webhook url/i);
        resolve();
      });
    });
  });
});
