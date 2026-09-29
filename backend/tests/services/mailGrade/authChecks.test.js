jest.mock('mailauth', () => ({
  authenticate: jest.fn(),
}));

const { authenticate } = require('mailauth');
const { buildAuthFindings } = require('../../../services/mailGrade/authChecks');

describe('authChecks', () => {
  beforeEach(() => {
    authenticate.mockReset();
  });

  it('emits live SPF DKIM DMARC pass findings when mailauth passes', async () => {
    authenticate.mockResolvedValue({
      spf: { status: { result: 'pass', comment: 'ok' } },
      dkim: { status: { result: 'pass' }, results: [{ status: { result: 'pass' } }] },
      dmarc: { status: { result: 'pass', comment: 'p=none' }, headerFrom: 'example.com' },
    });

    const findings = await buildAuthFindings({
      source: 'From: Ada <ada@example.com>\nSubject: Hi\n\nHi',
      fromDomain: 'example.com',
      clientIp: '203.0.113.10',
    });

    const ids = findings.map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining(['spf_pass', 'dkim_pass', 'dmarc_pass']));
    expect(findings.every((f) => f.severity !== 'fail')).toBe(true);
  });

  it('warns when SPF cannot be fully evaluated without a client IP', async () => {
    authenticate.mockResolvedValue({
      spf: { status: { result: 'none' } },
      dkim: { status: { result: 'pass' }, results: [{ status: { result: 'pass' } }] },
      dmarc: { status: { result: 'pass' } },
    });

    const findings = await buildAuthFindings({
      source: 'From: Ada <ada@example.com>\nDKIM-Signature: v=1; d=example.com; s=s; b=x\nSubject: Hi\n\nHi',
      fromDomain: 'example.com',
      clientIp: null,
    });

    expect(findings.map((f) => f.id)).toEqual(expect.arrayContaining(['spf_no_ip']));
    expect(findings.find((f) => f.id === 'spf_no_ip').severity).toBe('warn');
  });

  it('emits warn inconclusive when mailauth times out', async () => {
    authenticate.mockRejectedValue(new Error('timeout'));

    const findings = await buildAuthFindings({
      source: 'From: Ada <ada@example.com>\nSubject: Hi\n\nHi',
      fromDomain: 'example.com',
      clientIp: '203.0.113.10',
      timeoutMs: 10,
    });

    expect(findings.map((f) => f.id)).toEqual(expect.arrayContaining(['auth_inconclusive']));
    expect(findings.find((f) => f.id === 'auth_inconclusive').severity).toBe('warn');
  });

  it('marks DKIM fail when verification fails', async () => {
    authenticate.mockResolvedValue({
      spf: { status: { result: 'pass' } },
      dkim: { status: { result: 'fail' }, results: [{ status: { result: 'fail', comment: 'bad sig' } }] },
      dmarc: { status: { result: 'fail' } },
    });

    const findings = await buildAuthFindings({
      source: 'From: Ada <ada@example.com>\nDKIM-Signature: v=1; d=example.com; s=s; b=x\nSubject: Hi\n\nHi',
      fromDomain: 'example.com',
      clientIp: '203.0.113.10',
    });

    expect(findings.map((f) => f.id)).toEqual(expect.arrayContaining(['dkim_fail', 'dmarc_fail']));
  });
});
