import { apiFetch, ApiError } from '@/api/client';
import { mockJsonFetch } from '@/test/mockFetch';

describe('apiFetch error messages', () => {
  beforeEach(() => {
    localStorage.setItem('hm_outbound_license', 'HM-AAAA-BBBB-CCCC-DDDD');
    jest.restoreAllMocks();
  });

  it('uses string error bodies from outbound controllers', async () => {
    mockJsonFetch(() => ({
      status: 400,
      body: { success: false, error: 'domain is required', code: 'DOMAIN_REQUIRED' },
    }));

    await expect(apiFetch('/api/outbound/domains', { method: 'POST', body: '{}' })).rejects.toMatchObject({
      message: 'domain is required',
      code: 'DOMAIN_REQUIRED',
      status: 400,
    });
  });

  it('unwraps nested Express error middleware payloads instead of [object Object]', async () => {
    mockJsonFetch(() => ({
      status: 500,
      body: {
        error: {
          message: 'Internal Server Error',
          correlationId: '30efef5b-aa50-49eb-8132-e977ba880f7a',
        },
      },
    }));

    try {
      await apiFetch('/api/outbound/domains', {
        method: 'POST',
        body: JSON.stringify({ domain: 'mail.example.com' }),
      });
      throw new Error('expected apiFetch to reject');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).message).toBe(
        'Internal Server Error (30efef5b-aa50-49eb-8132-e977ba880f7a)',
      );
      expect((err as ApiError).message).not.toContain('[object Object]');
    }
  });
});
