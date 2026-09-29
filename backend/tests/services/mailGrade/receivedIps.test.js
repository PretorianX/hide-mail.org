const { extractReceivedIps } = require('../../../services/mailGrade/receivedIps');

describe('receivedIps', () => {
  it('extracts public client IPs from Received headers', () => {
    const source = [
      'Received: from mail.example.com (mail.example.com [203.0.113.10])',
      ' by mx.hide-mail.org with ESMTPS id abc',
      ' for <grade-1@hide-mail.org>; Tue, 1 Mar 2026 12:00:00 +0000',
      'Received: from localhost (127.0.0.1) by mail.example.com',
      'From: Ada <ada@example.com>',
      'Subject: Hi',
      '',
      'Body',
    ].join('\r\n');

    expect(extractReceivedIps(source)).toEqual(['203.0.113.10']);
  });

  it('skips private and link-local addresses', () => {
    const source = [
      'Received: from internal ([10.1.2.3]) by mx.example.com',
      'Received: from peer ([192.168.1.9]) by mx.example.com',
      'From: a@b.com',
      'Subject: x',
      '',
      'y',
    ].join('\r\n');

    expect(extractReceivedIps(source)).toEqual([]);
  });
});
