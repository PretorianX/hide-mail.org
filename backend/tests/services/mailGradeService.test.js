const { gradeEmail, MailGradeError } = require('../../services/mailGradeService');

const GOOD_EMAIL = [
  'From: Newsletter <news@example.com>',
  'To: reader@example.com',
  'Subject: Your March update',
  'Date: Tue, 1 Mar 2026 12:00:00 +0000',
  'Message-ID: <march@example.com>',
  'MIME-Version: 1.0',
  'Content-Type: multipart/alternative; boundary="b"',
  'DKIM-Signature: v=1; a=rsa-sha256; d=example.com; s=default; b=abc',
  'List-Unsubscribe: <mailto:unsub@example.com>',
  'Authentication-Results: mx.example.com; spf=pass; dkim=pass; dmarc=pass',
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

describe('mailGradeService', () => {
  it('refuses an empty submission', async () => {
    await expect(gradeEmail('   ')).rejects.toMatchObject({
      code: 'EMPTY_EMAIL',
    });
  });

  it('refuses text that is not an email', async () => {
    await expect(gradeEmail('hello there, this is a note')).rejects.toBeInstanceOf(MailGradeError);
    await expect(gradeEmail('hello there, this is a note')).rejects.toMatchObject({
      code: 'NOT_AN_EMAIL',
    });
  });

  it('refuses a source larger than 64 KB', async () => {
    const huge = `Subject: big\r\n\r\n${'a'.repeat(70 * 1024)}`;
    await expect(gradeEmail(huge)).rejects.toMatchObject({ code: 'EMAIL_TOO_LARGE' });
  });

  it('gives a ready-to-send message a high grade and does not store it', async () => {
    const report = await gradeEmail(GOOD_EMAIL);

    expect(report.stored).toBe(false);
    expect(report.grade).toBe('A');
    expect(report.score).toBeGreaterThanOrEqual(90);
    expect(report.summary).toMatch(/ready to send/);
    expect(report.findings.map((finding) => finding.id)).toEqual(expect.arrayContaining([
      'from_present',
      'dkim_present',
      'spf_pass',
      'text_alternative',
      'links_https',
      'list_unsubscribe',
    ]));
    expect(report.findings.every((finding) => finding.severity !== 'fail')).toBe(true);
  });

  it('marks shouting, spam phrasing, a mismatched Reply-To and HTTP links', async () => {
    const report = await gradeEmail(POOR_EMAIL);
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
    ]));
  });

  it('fails SPF when Authentication-Results says so', async () => {
    const source = [
      'From: Ada <ada@example.com>',
      'To: you@example.com',
      'Subject: Hello',
      'Date: Tue, 1 Mar 2026 12:00:00 +0000',
      'Message-ID: <hi@example.com>',
      'Authentication-Results: mx.example.com; spf=fail',
      '',
      'A short note.',
      '',
    ].join('\r\n');

    const report = await gradeEmail(source);
    const spf = report.findings.find((finding) => finding.id === 'spf_fail');

    expect(spf).toMatchObject({ severity: 'fail' });
    expect(report.score).toBeLessThan(90);
  });
});
