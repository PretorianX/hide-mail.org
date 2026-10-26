const { gradeEmail, MailGradeError } = require('../../services/mailGradeService');

const GOOD_EMAIL = [
  'Received: from mail.example.com (mail.example.com [203.0.113.10]) by mx.hide-mail.org',
  'From: Newsletter <news@example.com>',
  'To: reader@example.com',
  'Subject: Your March update',
  'Date: Tue, 1 Mar 2026 12:00:00 +0000',
  'Message-ID: <march@example.com>',
  'MIME-Version: 1.0',
  'Content-Type: multipart/alternative; boundary="b"',
  'DKIM-Signature: v=1; a=rsa-sha256; d=example.com; s=default; b=abc',
  'List-Unsubscribe: <mailto:unsub@example.com>',
  '',
  '--b',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Hello, here is the March update. https://example.com/march',
  '',
  '--b',
  'Content-Type: text/html; charset=utf-8',
  '',
  '<p>Hello, here is the March update. <a href="https://example.com/march">Read it</a></p>',
  '--b--',
  '',
].join('\r\n');

const POOR_EMAIL = [
  'From: Winner <prize@spam.test>',
  'Reply-To: other@elsewhere.test',
  'To: you@example.com',
  'Subject: ACT NOW!!! YOU HAVE WON',
  '',
  'Click here for free money. http://bit.ly/prize',
  '',
].join('\r\n');

const passAuth = async () => ({
  spf: { status: { result: 'pass' } },
  dkim: { status: { result: 'pass' }, results: [{ status: { result: 'pass' } }] },
  dmarc: { status: { result: 'pass' } },
});

const cleanDnsbl = async () => null;
const noMx = async () => [];
const noTxt = async () => [];

const gradeOpts = {
  authenticateFn: passAuth,
  resolveDnsbl: cleanDnsbl,
  resolveMxIps: noMx,
  resolveTxt: noTxt,
};

describe('mailGradeService', () => {
  it('refuses an empty submission', async () => {
    await expect(gradeEmail('   ', gradeOpts)).rejects.toMatchObject({
      code: 'EMPTY_EMAIL',
    });
  });

  it('refuses text that is not an email', async () => {
    await expect(gradeEmail('hello there, this is a note', gradeOpts)).rejects.toBeInstanceOf(MailGradeError);
    await expect(gradeEmail('hello there, this is a note', gradeOpts)).rejects.toMatchObject({
      code: 'NOT_AN_EMAIL',
    });
  });

  it('refuses a source larger than 64 KB', async () => {
    const huge = `Subject: big\r\n\r\n${'a'.repeat(70 * 1024)}`;
    await expect(gradeEmail(huge, gradeOpts)).rejects.toMatchObject({ code: 'EMAIL_TOO_LARGE' });
  });

  it('gives a ready-to-send message a high grade and does not store it', async () => {
    const report = await gradeEmail(GOOD_EMAIL, gradeOpts);

    expect(report.stored).toBe(false);
    expect(report.grade).toBe('A');
    expect(report.score).toBeGreaterThanOrEqual(90);
    expect(report.summary).toMatch(/ready to send/);
    expect(report.findings.map((finding) => finding.id)).toEqual(expect.arrayContaining([
      'from_present',
      'dkim_present',
      'spf_pass',
      'dkim_pass',
      'dmarc_pass',
      'text_alternative',
      'links_https',
      'list_unsubscribe',
      'rbl_clean',
    ]));
    expect(report.findings.every((finding) => finding.severity !== 'fail')).toBe(true);
  });

  it('marks shouting, spam phrasing, a mismatched Reply-To and HTTP links', async () => {
    const report = await gradeEmail(POOR_EMAIL, gradeOpts);
    const ids = report.findings.map((finding) => finding.id);

    expect(report.grade).toBe('F');
    expect(report.score).toBeLessThan(55);
    expect(ids).toEqual(expect.arrayContaining([
      'subject_shouting',
      'subject_punctuation',
      'reply_to_mismatch',
      'dkim_missing',
      'insecure_links',
      'spam_phrases',
      'date_missing',
      'message_id_missing',
      'link_shortener',
      'spf_no_ip',
    ]));
  });

  it('fails SPF when live auth reports fail', async () => {
    const source = [
      'Received: from mail.example.com ([203.0.113.10]) by mx.hide-mail.org',
      'From: Ada <ada@example.com>',
      'To: you@example.com',
      'Subject: Hello',
      'Date: Tue, 1 Mar 2026 12:00:00 +0000',
      'Message-ID: <hi@example.com>',
      '',
      'A short note.',
      '',
    ].join('\r\n');

    const report = await gradeEmail(source, {
      ...gradeOpts,
      authenticateFn: async () => ({
        spf: { status: { result: 'fail' } },
        dkim: { status: { result: 'none' } },
        dmarc: { status: { result: 'fail' } },
      }),
    });
    const spf = report.findings.find((finding) => finding.id === 'spf_fail');

    expect(spf).toMatchObject({ severity: 'fail' });
    expect(report.score).toBeLessThan(90);
  });

  it('flags cloaked HTML and RBL hits from enrichers', async () => {
    const source = [
      'Received: from bad ([203.0.113.50]) by mx.hide-mail.org',
      'From: Ada <ada@bad.example>',
      'Subject: Hello friend',
      'Date: Tue, 1 Mar 2026 12:00:00 +0000',
      'Message-ID: <hi@bad.example>',
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<a href="https://evil.example/x" style="display:none">https://good.example/x</a>',
      '',
    ].join('\r\n');

    const report = await gradeEmail(source, {
      authenticateFn: passAuth,
      resolveMxIps: noMx,
      resolveDnsbl: async (query) => {
        if (String(query).endsWith('.zen.spamhaus.org') && String(query).startsWith('50.113.0.203.')) {
          return ['127.0.0.2'];
        }
        return null;
      },
    });

    const ids = report.findings.map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining([
      'css_cloaking',
      'hidden_link',
      'hidden_link_mismatch',
      'rbl_ip',
    ]));
  });

  it('flags all-caps subject, spam tokens, display-name domain spoofing, shortener links, and punycode domains', async () => {
    const source = [
      'Received: from mail.example.com ([203.0.113.10]) by mx.hide-mail.org',
      'From: "ceo@bank.com" <attacker@example.net>',
      'To: victim@example.org',
      'Subject: URGENT: CLAIM YOUR $$$ REWARD NOW!!!',
      'Date: Tue, 1 Mar 2026 12:00:00 +0000',
      'Message-ID: <spoof@example.net>',
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<p>Verify at <a href="https://rb.gy/short">short</a> or <a href="https://xn--pple-43d.com/login">apple</a></p>',
      '',
    ].join('\r\n');

    const report = await gradeEmail(source, gradeOpts);
    const byId = Object.fromEntries(report.findings.map((f) => [f.id, f]));

    expect(byId.subject_all_caps).toMatchObject({ severity: 'warn', penalty: 5 });
    expect(byId.subject_spam_tokens).toMatchObject({ severity: 'warn', penalty: 5 });
    expect(byId.from_display_spoof).toMatchObject({ severity: 'fail', penalty: 15 });
    expect(byId.links_shortener).toMatchObject({ severity: 'warn', penalty: 8 });
    expect(byId.links_punycode).toMatchObject({ severity: 'warn', penalty: 8 });
    expect(report.deliverability.shortenerLinks).toEqual(['https://rb.gy/short']);
    expect(report.deliverability.punycodeDomains).toEqual(['xn--pple-43d.com']);
  });

  it('inspects ARC chain headers and queries BIMI and MTA-STS TXT records', async () => {
    const source = [
      'Received: from mail.example.com ([203.0.113.10]) by mx.hide-mail.org',
      'ARC-Seal: i=2; a=rsa-sha256; cv=pass; d=forwarder.example; s=arc; b=xyz',
      'ARC-Message-Signature: i=2; a=rsa-sha256; d=forwarder.example; s=arc; b=xyz',
      'ARC-Authentication-Results: i=2; forwarder.example; arc=pass',
      'ARC-Seal: i=1; a=rsa-sha256; cv=none; d=mx.example; s=arc; b=abc',
      'ARC-Message-Signature: i=1; a=rsa-sha256; d=mx.example; s=arc; b=abc',
      'ARC-Authentication-Results: i=1; mx.example; spf=pass',
      'From: Newsletter <news@example.com>',
      'To: reader@example.com',
      'Subject: Your March update',
      'Date: Tue, 1 Mar 2026 12:00:00 +0000',
      'Message-ID: <march@example.com>',
      '',
      'Hello there.',
      '',
    ].join('\r\n');

    const report = await gradeEmail(source, {
      ...gradeOpts,
      resolveTxt: async (host) => {
        if (host === 'default._bimi.example.com') {
          return [['v=BIMI1; l=https://example.com/logo.svg;']];
        }
        if (host === '_mta-sts.example.com') {
          return [['v=STSv1; id=20260301;']];
        }
        return [];
      },
    });

    expect(report.authentication.arc).toEqual({
      present: true,
      status: 'pass',
      chainCount: 2,
    });
    expect(report.authentication.bimi).toEqual({
      present: true,
      record: 'v=BIMI1; l=https://example.com/logo.svg;',
    });
    expect(report.authentication.mtaSts).toEqual({
      present: true,
      record: 'v=STSv1; id=20260301;',
    });
  });
});
