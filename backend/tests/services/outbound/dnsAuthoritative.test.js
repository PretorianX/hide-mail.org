const {
  findAuthoritativeNameservers,
  queryAuthoritative,
} = require('../../../services/outbound/dnsAuthoritative');

describe('findAuthoritativeNameservers', () => {
  test('returns the first level that answers, walking from the full name up', async () => {
    const resolver = {
      resolveNs: jest.fn()
        .mockImplementationOnce(() => Promise.reject({ code: 'ENODATA' }))
        .mockImplementationOnce(() => Promise.resolve(['ns1.example.com', 'ns2.example.com'])),
    };

    const result = await findAuthoritativeNameservers('mail.example.com', resolver);

    expect(result).toEqual(['ns1.example.com', 'ns2.example.com']);
    expect(resolver.resolveNs).toHaveBeenNthCalledWith(1, 'mail.example.com');
    expect(resolver.resolveNs).toHaveBeenNthCalledWith(2, 'example.com');
  });

  test('returns [] when every level fails, including the TLD', async () => {
    const resolver = { resolveNs: jest.fn().mockRejectedValue({ code: 'ENOTFOUND' }) };

    expect(await findAuthoritativeNameservers('a.b.com', resolver)).toEqual([]);
    expect(resolver.resolveNs).toHaveBeenCalledTimes(3);
    expect(resolver.resolveNs).toHaveBeenLastCalledWith('com');
  });

  test('stops walking when a nameserver lookup has a transient failure', async () => {
    const resolver = { resolveNs: jest.fn().mockRejectedValue({ code: 'ESERVFAIL' }) };

    expect(await findAuthoritativeNameservers('mail.example.com', resolver)).toEqual([]);
    expect(resolver.resolveNs).toHaveBeenCalledTimes(1);
    expect(resolver.resolveNs).toHaveBeenCalledWith('mail.example.com');
  });
});

describe('queryAuthoritative', () => {
  test('answered includes every nameserver that responds, even with an empty record set', async () => {
    const resolver = {
      resolve4: jest.fn().mockImplementation((ns) => (
        Promise.resolve([ns === 'ns1' ? '1.1.1.1' : '2.2.2.2'])
      )),
    };
    const resolveTxt = jest.fn()
      .mockImplementationOnce(() => Promise.resolve([['v=DKIM1; ', 'p=abc']]))
      .mockImplementationOnce(() => Promise.resolve([]));
    const MockResolver = jest.fn().mockImplementation(() => ({
      setServers: jest.fn(),
      resolveTxt,
    }));

    const result = await queryAuthoritative({
      name: 'x._domainkey.example.com',
      type: 'TXT',
      nameservers: ['ns1', 'ns2'],
      resolver,
      ResolverCtor: MockResolver,
    });

    expect(result.answered).toHaveLength(2);
    expect(result.answered[0]).toEqual({
      nameserver: 'ns1',
      records: ['v=DKIM1; p=abc'],
      error: null,
    });
    expect(result.answered[1].records).toEqual([]);
  });

  test('a nameserver that times out is excluded from answered, not recorded as empty', async () => {
    const resolver = {
      resolve4: jest.fn().mockResolvedValue(['1.1.1.1']),
    };
    const MockResolver = jest.fn().mockImplementation(() => ({
      setServers: jest.fn(),
      resolveTxt: jest.fn().mockReturnValue(new Promise(() => {})),
    }));

    const result = await queryAuthoritative({
      name: 'x',
      type: 'TXT',
      nameservers: ['ns1'],
      resolver,
      ResolverCtor: MockResolver,
      timeoutMs: 20,
    });

    expect(result.answered).toHaveLength(0);
  });

  test('a nameserver whose glue A record does not resolve is excluded from answered', async () => {
    const resolver = { resolve4: jest.fn().mockRejectedValue({ code: 'ENOTFOUND' }) };

    const result = await queryAuthoritative({
      name: 'x',
      type: 'TXT',
      nameservers: ['ns1'],
      resolver,
    });

    expect(result.answered).toHaveLength(0);
  });

  test('queries CNAME records through the resolved nameserver address', async () => {
    const resolver = {
      resolve4: jest.fn().mockResolvedValue(['192.0.2.1']),
    };
    const setServers = jest.fn();
    const resolve = jest.fn().mockResolvedValue(['target.example.com']);
    const MockResolver = jest.fn().mockImplementation(() => ({ setServers, resolve }));

    const result = await queryAuthoritative({
      name: 'alias.example.com',
      type: 'CNAME',
      nameservers: ['ns1.example.com'],
      resolver,
      ResolverCtor: MockResolver,
    });

    expect(setServers).toHaveBeenCalledWith(['192.0.2.1']);
    expect(resolve).toHaveBeenCalledWith('alias.example.com', 'CNAME');
    expect(result.answered).toEqual([{
      nameserver: 'ns1.example.com',
      records: ['target.example.com'],
      error: null,
    }]);
  });

  test.each(['ENOTFOUND', 'ENODATA'])(
    'includes an authoritative empty response reported as %s',
    async (code) => {
      const resolver = {
        resolve4: jest.fn().mockResolvedValue(['192.0.2.1']),
      };
      const MockResolver = jest.fn().mockImplementation(() => ({
        setServers: jest.fn(),
        resolveTxt: jest.fn().mockRejectedValue({ code }),
      }));

      const result = await queryAuthoritative({
        name: 'x',
        type: 'TXT',
        nameservers: ['ns1'],
        resolver,
        ResolverCtor: MockResolver,
      });

      expect(result.answered).toEqual([{
        nameserver: 'ns1',
        records: [],
        error: null,
      }]);
    }
  );

  test.each(['ECONNREFUSED', 'ESERVFAIL'])(
    'excludes a nameserver when its authoritative query fails with %s',
    async (code) => {
      const resolver = {
        resolve4: jest.fn().mockResolvedValue(['192.0.2.1']),
      };
      const MockResolver = jest.fn().mockImplementation(() => ({
        setServers: jest.fn(),
        resolveTxt: jest.fn().mockRejectedValue({ code }),
      }));

      const result = await queryAuthoritative({
        name: 'x',
        type: 'TXT',
        nameservers: ['ns1'],
        resolver,
        ResolverCtor: MockResolver,
      });

      expect(result.answered).toHaveLength(0);
    }
  );

  test('includes only the responder when another nameserver refuses the query', async () => {
    const resolver = {
      resolve4: jest.fn().mockImplementation((nameserver) => (
        Promise.resolve([nameserver === 'ns1' ? '192.0.2.1' : '192.0.2.2'])
      )),
    };
    const resolveTxt = jest.fn()
      .mockResolvedValueOnce([['v=DKIM1; p=abc']])
      .mockRejectedValueOnce({ code: 'ECONNREFUSED' });
    const MockResolver = jest.fn().mockImplementation(() => ({
      setServers: jest.fn(),
      resolveTxt,
    }));

    const result = await queryAuthoritative({
      name: 'x',
      type: 'TXT',
      nameservers: ['ns1', 'ns2'],
      resolver,
      ResolverCtor: MockResolver,
    });

    expect(result.answered).toEqual([{
      nameserver: 'ns1',
      records: ['v=DKIM1; p=abc'],
      error: null,
    }]);
  });

  test('excludes a malformed non-array resolver result from answered', async () => {
    const resolver = {
      resolve4: jest.fn().mockResolvedValue(['192.0.2.1']),
    };
    const MockResolver = jest.fn().mockImplementation(() => ({
      setServers: jest.fn(),
      resolveTxt: jest.fn().mockResolvedValue('malformed'),
    }));

    const result = await queryAuthoritative({
      name: 'x',
      type: 'TXT',
      nameservers: ['ns1'],
      resolver,
      ResolverCtor: MockResolver,
    });

    expect(result.answered).toHaveLength(0);
  });
});
