import LicenseService from './LicenseService';

describe('LicenseService', () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('saves and reads the license key from localStorage', () => {
    LicenseService.saveKey('HM-AAAA-BBBB-CCCC-DDDD');
    expect(LicenseService.getKey()).toBe('HM-AAAA-BBBB-CCCC-DDDD');
  });

  test('restores a license and persists the key', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        license: { key: 'HM-AAAA-BBBB-CCCC-DDDD', active: true, type: 'pro' },
        entitlements: { ads: false },
      }),
    });

    const result = await LicenseService.restore('HM-AAAA-BBBB-CCCC-DDDD');
    expect(result.license.type).toBe('pro');
    expect(LicenseService.getKey()).toBe('HM-AAAA-BBBB-CCCC-DDDD');
    expect(fetch).toHaveBeenCalledWith(
      '/api/billing/license/validate',
      expect.objectContaining({ method: 'POST' })
    );
  });

  test('keeps the saved key when the API is unreachable', async () => {
    LicenseService.saveKey('HM-AAAA-BBBB-CCCC-DDDD');
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(LicenseService.restoreSaved()).resolves.toBeNull();
    expect(LicenseService.getKey()).toBe('HM-AAAA-BBBB-CCCC-DDDD');
  });

  test('keeps the saved key when the restore endpoint rate limits the request', async () => {
    LicenseService.saveKey('HM-AAAA-BBBB-CCCC-DDDD');
    fetch.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ success: false, error: 'Too many requests. Please try again later.' }),
    });

    await expect(LicenseService.restoreSaved()).resolves.toBeNull();
    expect(LicenseService.getKey()).toBe('HM-AAAA-BBBB-CCCC-DDDD');
  });

  test('drops the saved key only when the server reports it is gone', async () => {
    LicenseService.saveKey('HM-AAAA-BBBB-CCCC-DDDD');
    fetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ success: false, error: 'License not found' }),
    });

    await expect(LicenseService.restoreSaved()).resolves.toBeNull();
    expect(LicenseService.getKey()).toBeNull();
  });

  test('refuses to post a signed checkout payload anywhere but WayForPay', () => {
    expect(() =>
      LicenseService.submitWayforpayCheckout({
        paymentUrl: 'https://evil.example.com/pay',
        orderReference: 'pro-monthly-1',
      })
    ).toThrow(/unexpected payment url/i);
  });

  test('sends the selected display currency with checkout', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        checkout: { paymentUrl: 'https://secure.wayforpay.com/pay', amount: 140 },
      }),
    });

    await LicenseService.checkout('monthly', 'pro', 'EUR');
    expect(fetch).toHaveBeenCalledWith(
      '/api/billing/checkout',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ plan: 'monthly', type: 'pro', displayCurrency: 'EUR' }),
      })
    );
  });

  test('exchanges a handoff token for a paid license key', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        licenseKey: 'HM-AAAA-BBBB-CCCC-DDDD',
        apiKey: null,
      }),
    });

    const payload = await LicenseService.fetchPaidOrder('token-abc');
    expect(payload.licenseKey).toBe('HM-AAAA-BBBB-CCCC-DDDD');
    expect(fetch).toHaveBeenCalledWith(
      '/api/billing/order/token-abc',
      expect.objectContaining({ headers: expect.any(Object) })
    );
  });

  test('does not persist a license key when the handoff is not paid yet', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        licenseKey: null,
        data: { paidAt: null },
      }),
    });

    const payload = await LicenseService.fetchPaidOrder('token-abc');
    expect(payload.licenseKey == null).toBe(true);
    expect(LicenseService.getKey()).toBeNull();
  });
});
