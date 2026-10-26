const { readComplaint } = require('../../services/complaintReadService');

const bare = (feedbackType, extra = '') => [
  `Feedback-Type: ${feedbackType}`,
  'User-Agent: ExampleFBL/1.0',
  'Version: 1',
  'Original-Rcpt-To: <subscriber@example.net>',
  extra,
].filter(Boolean).join('\n');

const multipart = (feedbackBody, original = 'secret-original-body') => [
  'From: <fbl@receiver.example>',
  'To: <postmaster@sender.example>',
  'Subject: Abuse report',
  'MIME-Version: 1.0',
  'Content-Type: multipart/report; report-type=feedback-report; boundary="arf"',
  '',
  '--arf',
  'Content-Type: text/plain',
  '',
  'This is an abuse report.',
  '',
  '--arf',
  'Content-Type: message/feedback-report',
  '',
  feedbackBody,
  '',
  '--arf',
  'Content-Type: message/rfc822',
  '',
  'From: <news@sender.example>',
  'To: <someone-else@example.net>',
  'Subject: Weekly',
  '',
  original,
  '',
  '--arf--',
  '',
].join('\r\n');

describe('complaintReadService', () => {
  test.each([
    ['abuse', 'ABUSE', 'suppress', 'Remove this address from the list.'],
    ['fraud', 'FRAUD', 'suppress', 'Remove this address from the list.'],
    ['virus', 'VIRUS', 'suppress', 'Remove this address from the list.'],
    ['not-spam', 'NOT-SPAM', 'keep', 'Keep this address. The receiver said this mail was wanted.'],
    ['auth-failure', 'AUTH', 'review', 'Do not remove this address automatically.'],
    ['other', 'OTHER', 'review', 'Do not remove this address automatically.'],
  ])('%s stamps %s and %s', (feedbackType, stamp, action, actionLabel) => {
    const report = readComplaint(bare(feedbackType));

    expect(report.stamp).toBe(stamp);
    expect(report.feedbackType).toBe(feedbackType);
    expect(report.action).toBe(action);
    expect(report.actionLabel).toBe(actionLabel);
    expect(report.recipient).toBe('subscriber@example.net');
    expect(report.stored).toBe(false);
  });

  it('reads a multipart feedback report and does not return the original message', () => {
    const report = readComplaint(multipart([
      'Feedback-Type: abuse',
      'User-Agent: Yahoo!-Mail-Feedback/1.0',
      'Version: 1',
      'Original-Mail-From: <news@sender.example>',
      'Original-Rcpt-To: rfc822; Subscriber@Example.net',
      'Received-Date: Thu, 8 Mar 2005 14:00:00 -0500',
      'Source-IP: 192.0.2.1',
      'Reported-Domain: sender.example.',
    ].join('\r\n')));

    expect(report).toEqual({
      stored: false,
      stamp: 'ABUSE',
      feedbackType: 'abuse',
      action: 'suppress',
      actionLabel: 'Remove this address from the list.',
      recipient: 'subscriber@example.net',
      mailFrom: 'news@sender.example',
      sourceIp: '192.0.2.1',
      reportedDomain: 'sender.example',
      userAgent: 'Yahoo!-Mail-Feedback/1.0',
      receivedDate: 'Thu, 8 Mar 2005 14:00:00 -0500',
      arrivalDate: null,
    });
    expect(JSON.stringify(report)).not.toContain('secret-original-body');
    expect(JSON.stringify(report)).not.toContain('someone-else@example.net');
  });

  it('reads a base64 feedback-report part', () => {
    const encoded = Buffer.from([
      'Feedback-Type: fraud',
      'Original-Rcpt-To: <fraud@example.net>',
      'Source-IP: 198.51.100.4',
    ].join('\n')).toString('base64');
    const source = [
      'Content-Type: multipart/report; report-type=feedback-report; boundary=arf',
      '',
      '--arf',
      'Content-Type: message/feedback-report',
      'Content-Transfer-Encoding: base64',
      '',
      encoded,
      '',
      '--arf--',
      '',
    ].join('\n');

    const report = readComplaint(source);

    expect(report.stamp).toBe('FRAUD');
    expect(report.recipient).toBe('fraud@example.net');
    expect(report.sourceIp).toBe('198.51.100.4');
  });

  it('unfolds a folded recipient and accepts an IPv6 source', () => {
    const report = readComplaint([
      'Feedback-Type: abuse',
      'Original-Rcpt-To:',
      ' <folded@example.com>',
      'Source-IP: 2001:DB8::1',
      'Arrival-Date: Thu, 8 Mar 2005 14:00:00 -0500',
    ].join('\n'));

    expect(report.recipient).toBe('folded@example.com');
    expect(report.sourceIp).toBe('2001:db8::1');
    expect(report.arrivalDate).toBe('Thu, 8 Mar 2005 14:00:00 -0500');
    expect(report.receivedDate).toBeNull();
  });

  it('does not take the address from the attached original message', () => {
    const source = multipart('Feedback-Type: abuse\r\nUser-Agent: Example/1.0\r\nVersion: 1');

    expect(() => readComplaint(source)).toThrow('This complaint does not name an address to suppress.');
    try {
      readComplaint(source);
    } catch (error) {
      expect(error.code).toBe('NO_RECIPIENT');
    }
  });

  it('rejects an empty paste', () => {
    expect(() => readComplaint('  ')).toThrow('Paste a feedback report first.');
    expect(() => readComplaint('  ')).toThrow(expect.objectContaining({ code: 'EMPTY_COMPLAINT' }));
  });

  it('rejects a complaint larger than 64 KB', () => {
    const source = `${bare('abuse')}\n${'x'.repeat(64 * 1024)}`;

    expect(() => readComplaint(source)).toThrow(expect.objectContaining({
      code: 'COMPLAINT_TOO_LARGE',
    }));
  });

  it('rejects a normal email and prose', () => {
    expect(() => readComplaint('From: Ada <ada@example.com>\nSubject: Hello\n\nHi')).toThrow(
      'That text is not an abuse feedback report.'
    );
    expect(() => readComplaint('Please stop emailing me')).toThrow(
      expect.objectContaining({ code: 'NOT_A_COMPLAINT' })
    );
  });

  it('rejects a delivery status notification', () => {
    const dsn = [
      'Content-Type: multipart/report; report-type=delivery-status; boundary=dsn',
      '',
      '--dsn',
      'Content-Type: text/plain',
      '',
      'Failed.',
      '',
      '--dsn',
      'Content-Type: message/delivery-status',
      '',
      'Final-Recipient: rfc822; ada@example.com',
      'Action: failed',
      'Status: 5.1.1',
      '',
      '--dsn--',
      '',
    ].join('\n');

    expect(() => readComplaint(dsn)).toThrow('That is a delivery status, not an abuse complaint.');
    expect(() => readComplaint([
      'Final-Recipient: rfc822; ada@example.com',
      'Action: failed',
      'Status: 5.1.1',
    ].join('\n'))).toThrow('That is a delivery status, not an abuse complaint.');
  });

  it('rejects a feedback type it does not act on, a bad IP, and a repeated recipient', () => {
    expect(() => readComplaint(bare('spam'))).toThrow(
      'Feedback-Type is not one Complaint Read acts on.'
    );
    expect(() => readComplaint(bare('abuse', 'Source-IP: unknown'))).toThrow(
      'Source-IP is not an IP address.'
    );
    expect(() => readComplaint([
      'Feedback-Type: abuse',
      'Original-Rcpt-To: <one@example.net>',
      'Original-Rcpt-To: <two@example.net>',
    ].join('\n'))).toThrow('Original-Rcpt-To is repeated.');
  });
});
