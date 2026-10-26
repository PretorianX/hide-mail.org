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
});
