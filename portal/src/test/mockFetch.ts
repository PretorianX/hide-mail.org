export function mockJsonFetch(handler: (url: string, init?: RequestInit) => { status: number; body: unknown }) {
  const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const result = handler(url, init);
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => result.body,
      text: async () => JSON.stringify(result.body),
    } as Response;
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
