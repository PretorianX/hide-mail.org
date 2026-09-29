const { buildReputationFindings } = require('../../../services/mailGrade/reputationChecks');

describe('reputationChecks', () => {
  const resolveDnsbl = jest.fn();

  beforeEach(() => {
    resolveDnsbl.mockReset();
  });

  it('fails when From domain is listed on a domain blocklist', async () => {
    resolveDnsbl.mockImplementation(async (query) => {
      if (query.endsWith('.dbl.spamhaus.org')) {
        return ['127.0.1.2'];
      }
      return null;
    });

    const findings = await buildReputationFindings({
      fromDomain: 'bad.example',
      linkHosts: [],
      ips: [],
      resolveDnsbl,
    });

    expect(findings.map((f) => f.id)).toEqual(expect.arrayContaining(['rbl_domain']));
    expect(findings.find((f) => f.id === 'rbl_domain').severity).toBe('fail');
  });

  it('fails when a Received IP is listed on an IP RBL', async () => {
    resolveDnsbl.mockImplementation(async (query) => {
      if (String(query).endsWith('.zen.spamhaus.org')) {
        return ['127.0.0.2'];
      }
      return null;
    });

    const findings = await buildReputationFindings({
      fromDomain: 'good.example',
      linkHosts: [],
      ips: ['203.0.113.50'],
      resolveDnsbl,
    });

    expect(findings.map((f) => f.id)).toEqual(expect.arrayContaining(['rbl_ip']));
    expect(findings.find((f) => f.id === 'rbl_ip').detail).toMatch(/203\.0\.113\.50/);
  });

  it('warns when DNSBL lookup times out', async () => {
    resolveDnsbl.mockRejectedValue(new Error('ENOTFOUND timeout'));

    const findings = await buildReputationFindings({
      fromDomain: 'example.com',
      linkHosts: ['cdn.example'],
      ips: ['203.0.113.10'],
      resolveDnsbl,
      timeoutMs: 5,
    });

    expect(findings.map((f) => f.id)).toEqual(expect.arrayContaining(['rbl_inconclusive']));
    expect(findings.find((f) => f.id === 'rbl_inconclusive').severity).toBe('warn');
  });

  it('passes when nothing is listed', async () => {
    resolveDnsbl.mockResolvedValue(null);

    const findings = await buildReputationFindings({
      fromDomain: 'example.com',
      linkHosts: ['example.com'],
      ips: ['203.0.113.10'],
      resolveDnsbl,
    });

    expect(findings.map((f) => f.id)).toEqual(expect.arrayContaining(['rbl_clean']));
    expect(findings.every((f) => f.severity !== 'fail')).toBe(true);
  });
});
