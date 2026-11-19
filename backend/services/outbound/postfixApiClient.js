/**
 * Minimal Bearer client for postfix-http-api read endpoints.
 */

const createPostfixApiClient = ({ baseUrl, token, fetchImpl = global.fetch } = {}) => {
  const root = String(baseUrl || '').replace(/\/+$/, '');
  if (!root) {
    throw new Error('POSTFIX_API_BASE_URL is required');
  }
  if (!token) {
    throw new Error('POSTFIX_API_TOKEN is required');
  }

  const request = async (path, query = {}) => {
    const url = new URL(`${root}${path}`);
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }

    const response = await fetchImpl(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const err = new Error(`postfix-api ${response.status}: ${body.slice(0, 200)}`);
      err.status = response.status;
      throw err;
    }

    return response.json();
  };

  return {
    getEvents: ({ after = 0, limit = 100 } = {}) => request('/v1/events', { after, limit }),
  };
};

module.exports = {
  createPostfixApiClient,
};
