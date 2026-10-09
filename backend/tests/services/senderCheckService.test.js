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
});
