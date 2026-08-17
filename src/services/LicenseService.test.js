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
});
