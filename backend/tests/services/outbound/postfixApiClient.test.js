const { createPostfixApiClient } = require('../../../services/outbound/postfixApiClient');

describe('createPostfixApiClient', () => {
  it('requires baseUrl and token', () => {
    expect(() => createPostfixApiClient({ token: 't' })).toThrow(/POSTFIX_API_BASE_URL/);
    expect(() => createPostfixApiClient({ baseUrl: 'http://postfix:8025' })).toThrow(
      /POSTFIX_API_TOKEN/
    );
  });

  it('GETs /v1/events with Bearer token, after, and limit', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        events: [
          {
            id: 101,
            time: '2026-11-18T16:54:43.130000000Z',
            queue_id: '4jV74M63RlzHxK3',
            event: 'processed',
          },
        ],
      }),
    });

    const client = createPostfixApiClient({
      baseUrl: 'http://postfix-relay:8025/',
      token: 'pfapi_test_token',
      fetchImpl,
    });

    const payload = await client.getEvents({ after: 100, limit: 50 });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://postfix-relay:8025/v1/events?after=100&limit=50');
    expect(opts).toMatchObject({
      method: 'GET',
      headers: {
        Authorization: 'Bearer pfapi_test_token',
        Accept: 'application/json',
      },
    });
    expect(payload.events).toHaveLength(1);
    expect(payload.events[0].queue_id).toBe('4jV74M63RlzHxK3');
  });

  it('throws with status when the API returns an error', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '{"error":"unauthorized"}',
    });

    const client = createPostfixApiClient({
      baseUrl: 'http://postfix:8025',
      token: 'bad',
      fetchImpl,
    });

    await expect(client.getEvents()).rejects.toMatchObject({
      message: expect.stringContaining('postfix-api 401'),
      status: 401,
    });
  });

  it('defaults after=0 and limit=100 when getEvents is called with no args', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events: [] }),
    });

    const client = createPostfixApiClient({
      baseUrl: 'http://postfix:8025',
      token: 't',
      fetchImpl,
    });

    await client.getEvents();
    expect(fetchImpl.mock.calls[0][0]).toBe('http://postfix:8025/v1/events?after=0&limit=100');
  });
});
