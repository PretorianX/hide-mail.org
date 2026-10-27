const bounceReadService = require('../../services/bounceReadService');

const deliveryStatus = [
  'Reporting-MTA: dns; mx.example.com',
  '',
  'Final-Recipient: rfc822; ada@example.com',
  'Action: failed',
  'Status: 5.1.1',
  'Remote-MTA: dns; mx.example.net',
  'Diagnostic-Code: smtp; 550 5.1.1',
  ' User unknown',
  '',
].join('\r\n');

const mimeBounce = (statusPart) => {
  const boundary = 'bounce-boundary';
  return [
    'From: Mail Delivery Subsystem <mailer-daemon@mx.example.com>',
    'To: sender@example.org',
    'Subject: Undelivered Mail Returned to Sender',
    'MIME-Version: 1.0',
    `Content-Type: multipart/report; report-type=delivery-status; boundary=${boundary}`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Your message could not be delivered to one or more recipients.',
    '',
    `--${boundary}`,
    'Content-Type: message/delivery-status',
    '',
    statusPart,
    `--${boundary}--`,
    '',
  ].join('\r\n');
};

const ordinaryMail = [
  'From: Ada <ada@example.com>',
  'To: you@example.com',
  'Subject: Hello',
  '',
  'The user unknown phrase is not a bounce.',
  '',
].join('\r\n');

describe('bounceReadService', () => {
  it('classifies a permanent mailbox failure and does not store the source', async () => {
    const report = await bounceReadService.readBounce(mimeBounce(deliveryStatus));

    expect(report.stored).toBe(false);
    expect(report.verdict).toBe('hard');
    expect(report.summary).toBe('Hard failure. Do not retry ada@example.com.');
    expect(report.reportingMta).toBe('dns; mx.example.com');
    expect(report.recipients).toEqual([
      expect.objectContaining({
        recipient: 'ada@example.com',
        action: 'failed',
        status: '5.1.1',
        class: 'hard',
        retry: false,
        title: 'No such mailbox',
        diagnostic: 'smtp; 550 5.1.1 User unknown',
        remoteMta: 'dns; mx.example.net',
      }),
    ]);
  });

  it('reads a bare delivery-status document', async () => {
    const report = await bounceReadService.readBounce([
      'Final-Recipient: rfc822; ada@example.com',
      'Action: failed',
      'Status: 4.2.2',
      'Diagnostic-Code: smtp; 452 4.2.2 mailbox full',
    ].join('\n'));

    expect(report.verdict).toBe('soft');
    expect(report.summary).toBe('Temporary failure. You can retry ada@example.com.');
    expect(report.recipients[0].retry).toBe(true);
    expect(report.recipients[0].title).toBe('Mailbox full');
  });

  it('marks a delayed 4.x action as still in progress', async () => {
    const report = await bounceReadService.readBounce([
      'Final-Recipient: rfc822; ada@example.com',
      'Action: delayed',
      'Status: 4.4.1',
    ].join('\n'));

    expect(report.verdict).toBe('delayed');
    expect(report.recipients[0].retry).toBe(true);
    expect(report.summary).toMatch(/You can retry ada@example.com/);
  });

  it('separates hard failures from addresses that are still worth a retry', async () => {
    const report = await bounceReadService.readBounce([
      'Reporting-MTA: dns; mx.example.com',
      '',
      'Final-Recipient: rfc822; gone@example.com',
      'Action: failed',
      'Status: 5.1.1',
      '',
      'Final-Recipient: rfc822; later@example.com',
      'Action: delayed',
      'Status: 4.4.1',
    ].join('\n'));

    expect(report.verdict).toBe('mixed');
    expect(report.summary).toBe('1 hard, 1 still worth a retry. Stop retrying the hard failures.');
    expect(report.recipients.map((item) => item.recipient)).toEqual([
      'gone@example.com',
      'later@example.com',
    ]);
  });

  it('rejects an ordinary email instead of grading it', async () => {
    await expect(bounceReadService.readBounce(ordinaryMail)).rejects.toMatchObject({
      code: 'NOT_A_BOUNCE',
    });
  });

  it('rejects prose that only sounds like a bounce', async () => {
    await expect(
      bounceReadService.readBounce('Delivery failed. User unknown. Please try again later.')
    ).rejects.toMatchObject({ code: 'NOT_A_BOUNCE' });
  });

  it('rejects an empty paste', async () => {
    await expect(bounceReadService.readBounce('  ')).rejects.toMatchObject({
      code: 'EMPTY_BOUNCE',
    });
  });

  it('reads a bounce whose header name is constructor', async () => {
    const report = await bounceReadService.readBounce([
      'Final-Recipient: rfc822; ada@example.com',
      'Action: failed',
      'Status: 5.1.1',
      'Constructor: polluted',
      '',
    ].join('\n'));

    expect(report.recipients[0].recipient).toBe('ada@example.com');
    expect(report.recipients[0].status).toBe('5.1.1');
    expect(Object.prototype).not.toHaveProperty('constructor', 'polluted');
  });

  it('rejects a bounce larger than 64 KB', async () => {
    const huge = `${deliveryStatus}\n${'x'.repeat(64 * 1024)}`;
    await expect(bounceReadService.readBounce(huge)).rejects.toMatchObject({
      code: 'BOUNCE_TOO_LARGE',
    });
  });

  describe('ISP Diagnostic Pattern Matcher', () => {
    it('classifies a generic 5.0.0 Gmail DMARC rejection with reasonCode, ispHint, and overridden explanation', async () => {
      const report = await bounceReadService.readBounce([
        'Reporting-MTA: dns; mx.sender.example',
        '',
        'Final-Recipient: rfc822; user@gmail.com',
        'Action: failed',
        'Status: 5.0.0',
        'Remote-MTA: dns; gmail-smtp-in.l.google.com',
        'Diagnostic-Code: smtp; 550-5.7.26 Unauthenticated email from example.com is not accepted due to domain\'s DMARC policy.',
      ].join('\n'));

      const rec = report.recipients[0];
      expect(rec.reasonCode).toBe('policy_dmarc');
      expect(rec.ispHint).toBe('Gmail');
      expect(rec.title).not.toBe('Permanent failure');
      expect(rec.title).toMatch(/DMARC/i);
      expect(rec.category).toBe('Security or Policy Status');
      expect(rec.remediation).toMatch(/DMARC|SPF|DKIM/i);
    });

    it('classifies a generic 5.5.0 Spamhaus blocklist bounce and detects Microsoft 365 / Outlook', async () => {
      const report = await bounceReadService.readBounce([
        'Reporting-MTA: dns; NAM10-MW2-obe.outbound.protection.outlook.com',
        '',
        'Final-Recipient: rfc822; bob@contoso.com',
        'Action: failed',
        'Status: 5.5.0',
        'Remote-MTA: dns; contoso-com.mail.protection.outlook.com',
        'Diagnostic-Code: smtp; 550 5.7.1 Service unavailable, Client host [198.51.100.12] blocked using zen.spamhaus.org',
      ].join('\n'));

      const rec = report.recipients[0];
      expect(rec.reasonCode).toBe('blocklist');
      expect(rec.ispHint).toBe('Microsoft 365 / Outlook');
      expect(rec.title).not.toBe('Protocol failure');
      expect(rec.title).toMatch(/blocklist|reputation/i);
      expect(rec.category).toBe('Security or Policy Status');
    });

    it('classifies rate_limit on generic 4.0.0 with Yahoo / AOL hint', async () => {
      const report = await bounceReadService.readBounce([
        'Final-Recipient: rfc822; reader@yahoo.com',
        'Action: delayed',
        'Status: 4.0.0',
        'Remote-MTA: dns; mta5.am0.yahoodns.net',
        'Diagnostic-Code: smtp; 421 4.7.0 [TSS04] Messages from 198.51.100.12 temporarily deferred due to user complaints - rate limit throttled, try again later',
      ].join('\n'));

      const rec = report.recipients[0];
      expect(rec.reasonCode).toBe('rate_limit');
      expect(rec.ispHint).toBe('Yahoo / AOL');
      expect(rec.title).toMatch(/rate limit|throttl/i);
    });

    it('detects policy_spf, quota_exceeded, bad_mailbox, spam_content, and other ISP hints', async () => {
      const spfReport = await bounceReadService.readBounce([
        'Final-Recipient: rfc822; a@example.com',
        'Action: failed',
        'Status: 5.0.0',
        'Remote-MTA: dns; mxa-00123401.gslb.pphosted.com',
        'Diagnostic-Code: smtp; 550 5.7.23 SPF validation failed: not authorized to send on behalf of example.com',
      ].join('\n'));
      expect(spfReport.recipients[0].reasonCode).toBe('policy_spf');
      expect(spfReport.recipients[0].ispHint).toBe('Proofpoint');

      const spamReport = await bounceReadService.readBounce([
        'Final-Recipient: rfc822; b@example.com',
        'Action: failed',
        'Status: 5.0.0',
        'Remote-MTA: dns; eu-smtp-inbound-1.mimecast.com',
        'Diagnostic-Code: smtp; 554 Message rejected as spam due to high spam probability',
      ].join('\n'));
      expect(spamReport.recipients[0].reasonCode).toBe('spam_content');
      expect(spamReport.recipients[0].ispHint).toBe('Mimecast');

      const quotaReport = await bounceReadService.readBounce([
        'Final-Recipient: rfc822; c@example.com',
        'Action: failed',
        'Status: 5.0.0',
        'Remote-MTA: dns; inbound-smtp.us-east-1.amazonaws.com',
        'Diagnostic-Code: smtp; 552 5.2.2 user over quota, storage allocation exceeded',
      ].join('\n'));
      expect(quotaReport.recipients[0].reasonCode).toBe('quota_exceeded');
      expect(quotaReport.recipients[0].ispHint).toBe('Amazon SES');

      const barracudaReport = await bounceReadService.readBounce([
        'Final-Recipient: rfc822; d@example.com',
        'Action: failed',
        'Status: 5.0.0',
        'Remote-MTA: dns; d12345.ess.barracudanetworks.com',
        'Diagnostic-Code: smtp; 550 permanent failure for one or more recipients (user unknown)',
      ].join('\n'));
      expect(barracudaReport.recipients[0].reasonCode).toBe('bad_mailbox');
      expect(barracudaReport.recipients[0].ispHint).toBe('Barracuda');
    });

    it('preserves catalog title and detail for specific status codes like 5.1.1 while still setting reasonCode', async () => {
      const report = await bounceReadService.readBounce(mimeBounce(deliveryStatus));
      expect(report.recipients[0].status).toBe('5.1.1');
      expect(report.recipients[0].title).toBe('No such mailbox');
      expect(report.recipients[0].detail).toBe('The destination mailbox does not exist. Do not retry it.');
      expect(report.recipients[0].reasonCode).toBe('bad_mailbox');
    });
  });

  describe('Original Sent Message Header Extraction & Privacy Invariant', () => {
    it('extracts safe campaign headers from message/rfc822 and never includes To, Cc, Bcc, or message body', async () => {
      const boundary = 'dsn-boundary-99';
      const secretBody = 'TOP_SECRET_PASSWORD_RESET_TOKEN_99887766';
      const secretCc = 'private-cc-list@example.org';
      const fullDsn = [
        'From: Mail Delivery Subsystem <mailer-daemon@mx.example.com>',
        'To: bounce-handler@sender.example',
        'Subject: Undelivered Mail Returned to Sender',
        'MIME-Version: 1.0',
        `Content-Type: multipart/report; report-type=delivery-status; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        'Delivery failed.',
        '',
        `--${boundary}`,
        'Content-Type: message/delivery-status',
        '',
        deliveryStatus,
        `--${boundary}`,
        'Content-Type: message/rfc822',
        '',
        'Message-ID: <campaign-2026-10-42@sender.example>',
        'Subject: October Product Update',
        'From:Billing Team <billing@sender.example>',
        'To: ada@example.com',
        `Cc: ${secretCc}`,
        'Date: Mon, 26 Oct 2026 10:15:00 +0000',
        'List-Unsubscribe: <mailto:unsub@sender.example>, <https://sender.example/unsub>',
        '',
        secretBody,
        `--${boundary}--`,
        '',
      ].join('\r\n');

      const report = await bounceReadService.readBounce(fullDsn);

      expect(report.originalMessage).toEqual({
        messageId: '<campaign-2026-10-42@sender.example>',
        subject: 'October Product Update',
        from: 'Billing Team <billing@sender.example>',
        date: 'Mon, 26 Oct 2026 10:15:00 +0000',
        listUnsubscribe: '<mailto:unsub@sender.example>, <https://sender.example/unsub>',
      });
      expect(JSON.stringify(report)).not.toContain(secretBody);
      expect(JSON.stringify(report)).not.toContain(secretCc);
    });

    it('extracts originalMessage from text/rfc822-headers parts and returns null when absent', async () => {
      const bareReport = await bounceReadService.readBounce(deliveryStatus);
      expect(bareReport.originalMessage).toBeNull();

      const boundary = 'hdr-only-boundary';
      const dsnWithHeadersOnly = [
        'From: mailer-daemon@mx.example.com',
        'MIME-Version: 1.0',
        `Content-Type: multipart/report; report-type=delivery-status; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: message/delivery-status',
        '',
        deliveryStatus,
        `--${boundary}`,
        'Content-Type: text/rfc822-headers',
        '',
        'Message-ID: <hdr-only-123@sender.example>',
        'Subject: Welcome aboard',
        'From: hello@sender.example',
        '',
        `--${boundary}--`,
      ].join('\r\n');

      const report = await bounceReadService.readBounce(dsnWithHeadersOnly);
      expect(report.originalMessage).toEqual({
        messageId: '<hdr-only-123@sender.example>',
        subject: 'Welcome aboard',
        from: 'hello@sender.example',
        date: null,
        listUnsubscribe: null,
      });
    });
  });
});
