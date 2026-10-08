/**
 * Mail Grade calls require('mailauth').authenticate and reads
 * spf.status.result, dkim.results[].status.result, and dmarc.status.result.
 * The unit tests mock that module, so a 4.x to 7.x bump would not fail them.
 */

const { authenticate } = require('mailauth');
const { buildAuthFindings } = require('../../services/mailGrade/authChecks');

const source = [
  'From: Ada <ada@example.com>',
  'To: bob@hide-mail.org',
  'Subject: Hi',
  'Message-ID: <contract@example.com>',
  'Date: Thu, 8 Oct 2026 12:00:00 +0000',
  '',
  'Hello',
].join('\r\n');

const resolver = async (name, rr) => {
  const host = String(name).toLowerCase();
  if (rr === 'TXT' && host === 'example.com') {
    return [['v=spf1 ip4:203.0.113.10 -all']];
  }
  if (rr === 'TXT' && host === '_dmarc.example.com') {
    return [['v=DMARC1; p=none; adkim=r; aspf=r']];
  }
  const err = new Error('not found');
  err.code = 'ENOTFOUND';
  throw err;
};

const authenticateMessage = (ip) => authenticate(source, {
  sender: 'ada@example.com',
  ip,
  helo: 'mail.example.com',
  disableArc: true,
  disableBimi: true,
  resolver,
});

describe('mailauth authenticate contract', () => {
  it('returns the SPF, DKIM, and DMARC fields Mail Grade reads', async () => {
    const result = await authenticateMessage('203.0.113.10');

    expect(result.spf.status.result).toBe('pass');
    expect(result.dkim.results[0].status.result).toBe('none');
    expect(result.dmarc.status.result).toBe('pass');
    expect(result.dmarc.policy).toBe('none');

    const findings = await buildAuthFindings({
      source,
      fromDomain: 'example.com',
      clientIp: '203.0.113.10',
      authenticateFn: async () => result,
    });

    expect(findings.map((finding) => finding.id)).toEqual(
      expect.arrayContaining(['spf_pass', 'dkim_weak', 'dmarc_pass'])
    );
  });

  it('reports SPF fail when the client IP is not permitted', async () => {
    const result = await authenticateMessage('198.51.100.20');

    expect(result.spf.status.result).toBe('fail');
  });
});
