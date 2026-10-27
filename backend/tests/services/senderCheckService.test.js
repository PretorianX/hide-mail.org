const { checkDomain, SenderCheckError } = require('../../services/senderCheckService');

const nx = (code = 'ENOTFOUND') => Object.assign(new Error(code), { code });

const resolver = ({ mx, txt = {}, dmarc }) => ({
  async resolveMx() {
    if (mx instanceof Error) {
      throw mx;
    }
    return mx;
  },
  async resolveTxt(name) {
    const table = name.startsWith('_dmarc.') ? dmarc : txt;
    if (table instanceof Error) {
      throw table;
    }
    return table;
  },
});

const txt = (...rows) => rows.map((row) => [row]);

describe('senderCheckService', () => {
  it('rejects an empty name before any lookup', async () => {
    const resolveMx = jest.fn();
    await expect(checkDomain('   ', { resolver: { resolveMx } })).rejects.toMatchObject({
      code: 'DOMAIN_EMPTY',
    });
    expect(resolveMx).not.toHaveBeenCalled();
  });

  it('rejects an email address instead of stripping the mailbox', async () => {
    await expect(checkDomain('ada@example.com', { resolver: {} })).rejects.toMatchObject({
      code: 'DOMAIN_INVALID',
    });
  });

  it('accepts a domain under an internationalized top-level domain', async () => {
    const report = await checkDomain('пример.рф', {
      resolver: resolver({
        mx: [{ exchange: 'mx.example', priority: 10 }],
        txt: txt('v=spf1 -all'),
        dmarc: txt('v=DMARC1; p=reject'),
      }),
    });

    expect(report.domain).toBe('xn--e1afmkfd.xn--p1ai');
  });

  it('rejects a numeric top-level domain', async () => {
    await expect(checkDomain('example.123', { resolver: {} })).rejects.toMatchObject({
      code: 'DOMAIN_INVALID',
    });
  });

  it('rejects a URL instead of rewriting it into a domain', async () => {
    await expect(checkDomain('https://example.com/path', { resolver: {} })).rejects.toMatchObject({
      code: 'DOMAIN_INVALID',
    });
  });

  it('reports a domain that is not in DNS as blocked', async () => {
    const report = await checkDomain('missing.example', {
      resolver: resolver({ mx: nx(), txt: nx(), dmarc: nx() }),
    });

    expect(report.stored).toBe(false);
    expect(report.verdict).toBe('Blocked');
    expect(report.summary).toBe('missing.example is not in DNS.');
    expect(report.records.map((row) => row.status)).toEqual(['fail', 'fail', 'fail']);
  });

  it('marks an enforceable policy ready and does not store the domain', async () => {
    const report = await checkDomain('Example.COM.', {
      resolver: resolver({
        mx: [{ exchange: 'mx.example.com', priority: 10 }],
        txt: txt('v=spf1 include:_spf.example.com -all'),
        dmarc: txt('v=DMARC1; p=reject; rua=mailto:dmarc@example.com'),
      }),
    });

    expect(report.domain).toBe('example.com');
    expect(report.stored).toBe(false);
    expect(report.verdict).toBe('Ready');
    expect(report.records.find((row) => row.id === 'spf').status).toBe('pass');
    expect(report.records.find((row) => row.id === 'dmarc').status).toBe('pass');
    expect(report.records.find((row) => row.id === 'mx').detail).toContain('mx.example.com');
  });

  it('joins split TXT chunks before reading SPF', async () => {
    const report = await checkDomain('example.com', {
      resolver: resolver({
        mx: [{ exchange: 'mx.example.com', priority: 10 }],
        txt: [['v=spf1 ', '-all']],
        dmarc: txt('v=DMARC1; p=quarantine'),
      }),
    });

    expect(report.verdict).toBe('Ready');
    expect(report.records.find((row) => row.id === 'spf').record).toBe('v=spf1 -all');
  });

  it('treats a monitor-only DMARC policy as a gap', async () => {
    const report = await checkDomain('example.com', {
      resolver: resolver({
        mx: [{ exchange: 'mx.example.com', priority: 10 }],
        txt: txt('v=spf1 ~all'),
        dmarc: txt('v=DMARC1; p=none'),
      }),
    });

    expect(report.verdict).toBe('Gaps');
    expect(report.records.find((row) => row.id === 'dmarc').status).toBe('warn');
  });

  it('blocks a domain whose SPF allows every server', async () => {
    const report = await checkDomain('example.com', {
      resolver: resolver({
        mx: [{ exchange: 'mx.example.com', priority: 10 }],
        txt: txt('v=spf1 +all'),
        dmarc: txt('v=DMARC1; p=reject'),
      }),
    });

    expect(report.verdict).toBe('Blocked');
    expect(report.records.find((row) => row.id === 'spf').status).toBe('fail');
  });

  it('blocks more than one SPF record', async () => {
    const report = await checkDomain('example.com', {
      resolver: resolver({
        mx: [{ exchange: 'mx.example.com', priority: 10 }],
        txt: txt('v=spf1 -all', 'v=spf1 ~all'),
        dmarc: txt('v=DMARC1; p=reject'),
      }),
    });

    expect(report.records.find((row) => row.id === 'spf').status).toBe('fail');
    expect(report.verdict).toBe('Blocked');
  });

  it('warns on a null MX without hiding a strong sender policy', async () => {
    const report = await checkDomain('example.com', {
      resolver: resolver({
        mx: [{ exchange: '.', priority: 0 }],
        txt: txt('v=spf1 -all'),
        dmarc: txt('v=DMARC1; p=reject'),
      }),
    });

    expect(report.verdict).toBe('Gaps');
    expect(report.records.find((row) => row.id === 'mx').status).toBe('warn');
  });

  it('fails the lookup when DNS does not answer', async () => {
    await expect(checkDomain('example.com', {
      resolver: resolver({ mx: nx('ESERVFAIL') }),
    })).rejects.toBeInstanceOf(SenderCheckError);
    await expect(checkDomain('example.com', {
      resolver: resolver({ mx: nx('ESERVFAIL') }),
    })).rejects.toMatchObject({ code: 'DNS_UNAVAILABLE' });
  });

  it('does not carry one domain into the next report', async () => {
    const first = await checkDomain('one.example', {
      resolver: resolver({ mx: nx() }),
    });
    const second = await checkDomain('two.example', {
      resolver: resolver({
        mx: [{ exchange: 'mx.two.example', priority: 1 }],
        txt: txt('v=spf1 -all'),
        dmarc: txt('v=DMARC1; p=reject'),
      }),
    });

    expect(first.domain).toBe('one.example');
    expect(second.domain).toBe('two.example');
    expect(second.summary).not.toContain('one.example');
  });

  describe('DKIM selector inspector', () => {
    const rsa2048Base64 = Buffer.alloc(294, 0x30).toString('base64');
    const rsa1024Base64 = Buffer.alloc(162, 0x30).toString('base64');
    const rsa512Base64 = Buffer.alloc(94, 0x30).toString('base64');

    const mapResolver = (recordsByName) => ({
      async resolveMx() {
        return [{ exchange: 'mx.example.com', priority: 10 }];
      },
      async resolveTxt(name) {
        if (Object.prototype.hasOwnProperty.call(recordsByName, name)) {
          const val = recordsByName[name];
          if (val instanceof Error) throw val;
          return val;
        }
        throw nx();
      },
    });

    it('inspects an explicit dkimSelector and passes a 2048-bit RSA key', async () => {
      const report = await checkDomain('example.com', {
        dkimSelector: 'google',
        resolver: mapResolver({
          'example.com': txt('v=spf1 -all'),
          '_dmarc.example.com': txt('v=DMARC1; p=reject'),
          'google._domainkey.example.com': txt(`v=DKIM1; k=rsa; p=${rsa2048Base64}`),
        }),
      });

      expect(report.dkim.mode).toBe('explicit');
      expect(report.dkim.selectors).toHaveLength(1);
      expect(report.dkim.selectors[0]).toMatchObject({
        selector: 'google',
        status: 'pass',
        keyType: 'rsa',
        keyBits: 2048,
        revoked: false,
      });
      expect(report.transportAndBrand.dkim).toEqual(report.dkim);
    });

    it('warns on a 1024-bit RSA DKIM key and recommends upgrading to 2048-bit', async () => {
      const report = await checkDomain('example.com', {
        dkimSelector: 's1',
        resolver: mapResolver({
          'example.com': txt('v=spf1 -all'),
          '_dmarc.example.com': txt('v=DMARC1; p=reject; rua=mailto:dmarc@example.com'),
          's1._domainkey.example.com': txt(`v=DKIM1; k=rsa; p=${rsa1024Base64}`),
        }),
      });

      expect(report.dkim.selectors[0]).toMatchObject({
        selector: 's1',
        status: 'warn',
        keyType: 'rsa',
        keyBits: 1024,
      });
      expect(report.recommendations.some((r) => r.id === 'dkim_weak_key')).toBe(true);
    });

    it('fails a revoked DKIM key (empty p=) or <1024-bit RSA key', async () => {
      const revokedReport = await checkDomain('example.com', {
        dkimSelector: 'revoked',
        resolver: mapResolver({
          'example.com': txt('v=spf1 -all'),
          '_dmarc.example.com': txt('v=DMARC1; p=reject'),
          'revoked._domainkey.example.com': txt('v=DKIM1; k=rsa; p='),
        }),
      });

      expect(revokedReport.dkim.selectors[0]).toMatchObject({
        selector: 'revoked',
        status: 'fail',
        revoked: true,
      });

      const shortReport = await checkDomain('example.com', {
        dkimSelector: 'short',
        resolver: mapResolver({
          'example.com': txt('v=spf1 -all'),
          '_dmarc.example.com': txt('v=DMARC1; p=reject'),
          'short._domainkey.example.com': txt(`v=DKIM1; k=rsa; p=${rsa512Base64}`),
        }),
      });

      expect(shortReport.dkim.selectors[0]).toMatchObject({
        selector: 'short',
        status: 'fail',
        keyBits: 512,
      });
    });

    it('passes an ed25519 DKIM key', async () => {
      const edKey = Buffer.alloc(32, 0x11).toString('base64');
      const report = await checkDomain('example.com', {
        dkimSelector: 'ed',
        resolver: mapResolver({
          'example.com': txt('v=spf1 -all'),
          '_dmarc.example.com': txt('v=DMARC1; p=reject'),
          'ed._domainkey.example.com': txt(`v=DKIM1; k=ed25519; p=${edKey}; t=s`),
        }),
      });

      expect(report.dkim.selectors[0]).toMatchObject({
        selector: 'ed',
        status: 'pass',
        keyType: 'ed25519',
        keyBits: 256,
        strictMode: true,
      });
    });

    it('auto-probes common selectors when dkimSelector is omitted', async () => {
      const report = await checkDomain('example.com', {
        resolver: mapResolver({
          'example.com': txt('v=spf1 -all'),
          '_dmarc.example.com': txt('v=DMARC1; p=reject'),
          'google._domainkey.example.com': txt(`v=DKIM1; k=rsa; p=${rsa2048Base64}`),
          's1._domainkey.example.com': txt(`v=DKIM1; k=rsa; p=${rsa2048Base64}`),
        }),
      });

      expect(report.dkim.mode).toBe('probed');
      expect(report.dkim.selectors.map((s) => s.selector)).toEqual(['google', 's1']);
      expect(report.verdict).toBe('Ready');
      expect(report.records).toHaveLength(3);
    });
  });

  describe('BIMI, MTA-STS, and TLS-RPT lookups', () => {
    it('parses BIMI, MTA-STS, and TLS-RPT records without penalizing core Ready verdict when absent', async () => {
      const report = await checkDomain('example.com', {
        resolver: {
          async resolveMx() {
            return [{ exchange: 'mx.example.com', priority: 10 }];
          },
          async resolveTxt(name) {
            const map = {
              'example.com': txt('v=spf1 -all'),
              '_dmarc.example.com': txt('v=DMARC1; p=reject'),
              'default._bimi.example.com': txt('v=BIMI1; l=https://example.com/logo.svg; a=https://example.com/vmc.pem'),
              '_mta-sts.example.com': txt('v=STSv1; id=20260101'),
              '_smtp._tls.example.com': txt('v=TLSRPTv1; rua=mailto:tlsrpt@example.com'),
            };
            if (map[name]) return map[name];
            throw nx();
          },
        },
      });

      expect(report.verdict).toBe('Ready');
      expect(report.records).toHaveLength(3);
      expect(report.transportAndBrand.bimi).toMatchObject({
        status: 'pass',
        parsed: {
          version: 'BIMI1',
          logoUrl: 'https://example.com/logo.svg',
          authorityUrl: 'https://example.com/vmc.pem',
        },
      });
      expect(report.transportAndBrand.mtaSts).toMatchObject({
        status: 'pass',
        parsed: {
          version: 'STSv1',
          policyId: '20260101',
        },
      });
      expect(report.transportAndBrand.tlsRpt).toMatchObject({
        status: 'pass',
        parsed: {
          version: 'TLSRPTv1',
          rua: ['mailto:tlsrpt@example.com'],
        },
      });
    });
  });

  describe('Recursive SPF include and redirect lookup counter', () => {
    it('walks nested include: and redirect= targets with cycle detection and computes totalDnsLookups', async () => {
      const report = await checkDomain('example.com', {
        resolver: {
          async resolveMx() {
            return [{ exchange: 'mx.example.com', priority: 10 }];
          },
          async resolveTxt(name) {
            const map = {
              'example.com': txt('v=spf1 include:_spf1.example.com a -all'),
              '_spf1.example.com': txt('v=spf1 include:_spf2.example.com mx ~all'),
              '_spf2.example.com': txt('v=spf1 redirect=_spf3.example.com'),
              '_spf3.example.com': txt('v=spf1 include:_spf1.example.com ip4:192.0.2.0/24 -all'),
              '_dmarc.example.com': txt('v=DMARC1; p=reject'),
            };
            if (map[name]) return map[name];
            throw nx();
          },
        },
      });

      const spf = report.records.find((r) => r.id === 'spf');
      expect(spf.parsed.dnsLookupCount).toBe(2);
      // Top-level: include:_spf1 (1) + a (1) = 2
      // _spf1: include:_spf2 (1) + mx (1) = 2
      // _spf2: redirect=_spf3 (1) = 1
      // _spf3: include:_spf1 (1, cycle detected so not expanded further) = 1
      // Total = 6
      expect(spf.parsed.totalDnsLookups).toBe(6);
      expect(spf.parsed.includeTree).toHaveLength(4);
      expect(spf.parsed.includeTree.map((n) => n.domain)).toEqual([
        '_spf1.example.com',
        '_spf2.example.com',
        '_spf3.example.com',
        '_spf1.example.com',
      ]);
      expect(spf.parsed.includeTree[3].error).toMatch(/cycle/i);
    });
  });
});
