const { validatePublicHttpsWebhookUrl } = require('../../services/webhookUrlGuard');

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
});
