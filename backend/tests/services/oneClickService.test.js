const { readOneClick, OneClickError } = require('../../services/oneClickService');

const message = (headers, body = 'Hello') => `${headers.join('\n')}\n\n${body}`;

const PASSING = message([
  'From: News <news@sender.example>',
  'Subject: October',
  'List-Unsubscribe: <mailto:unsub@sender.example>, <https://sender.example/unsub/opaque>',
  'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
]);

describe('One-Click', () => {
  it('passes when an https URI and the one-click POST header are both present', () => {
    const report = readOneClick(`${PASSING}\nsecret-original-body`);

    expect(report.verdict).toBe('pass');
    expect(report.stamp).toBe('PASS');
    expect(report.stored).toBe(false);
    expect(report.postUri).toBe('https://sender.example/unsub/opaque');
    expect(report.postHeader).toBe('List-Unsubscribe=One-Click');
    expect(report.mailtoUris).toEqual(['mailto:unsub@sender.example']);
    expect(report.reasons).toEqual([]);
    expect(JSON.stringify(report)).not.toContain('secret-original-body');
  });

  it('unfolds a folded List-Unsubscribe header before choosing the POST URL', () => {
    const report = readOneClick(message([
      'From: News <news@sender.example>',
      'List-Unsubscribe: <mailto:unsub@sender.example>,',
      ' <https://sender.example/unsub>',
      'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
    ]));

    expect(report.verdict).toBe('pass');
    expect(report.postUri).toBe('https://sender.example/unsub');
  });

  it('combines repeated List-Unsubscribe headers', () => {
    const report = readOneClick(message([
      'Subject: October',
      'List-Unsubscribe: <mailto:unsub@sender.example>',
      'List-Unsubscribe: <https://sender.example/other>',
      'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
    ]));

    expect(report.verdict).toBe('pass');
    expect(report.postUri).toBe('https://sender.example/other');
  });

  it('fails a mailto-only unsubscribe', () => {
    const report = readOneClick(message([
      'From: News <news@sender.example>',
      'List-Unsubscribe: <mailto:unsub@sender.example>',
    ]));

    expect(report.verdict).toBe('fail');
    expect(report.stamp).toBe('FAIL');
    expect(report.postUri).toBeNull();
    expect(report.reasons).toEqual(expect.arrayContaining([
      'One-click needs an https URI. This message only offers mailto.',
      'List-Unsubscribe-Post is missing.',
    ]));
  });

  it('fails https without the one-click POST header', () => {
    const report = readOneClick(message([
      'From: News <news@sender.example>',
      'List-Unsubscribe: <https://sender.example/unsub>',
    ]));

    expect(report.verdict).toBe('fail');
    expect(report.reasons).toContain('List-Unsubscribe-Post is missing.');
  });

  it('fails a POST header that is not the exact one-click value', () => {
    const report = readOneClick(message([
      'Subject: October',
      'List-Unsubscribe: <https://sender.example/unsub>',
      'List-Unsubscribe-Post: list-unsubscribe=one-click',
    ]));

    expect(report.verdict).toBe('fail');
    expect(report.reasons).toContain(
      'List-Unsubscribe-Post must be exactly List-Unsubscribe=One-Click.'
    );
  });

  it('fails when the only URI is http', () => {
    const report = readOneClick(message([
      'From: News <news@sender.example>',
      'List-Unsubscribe: <http://sender.example/unsub>',
      'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
    ]));

    expect(report.verdict).toBe('fail');
    expect(report.httpUris).toEqual(['http://sender.example/unsub']);
    expect(report.reasons).toContain('One-click needs an https URI. This message only offers http.');
  });

  it('fails an https URI that embeds a username', () => {
    const report = readOneClick(message([
      'From: News <news@sender.example>',
      'List-Unsubscribe: <https://user:secret@sender.example/unsub>',
      'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
    ]));

    expect(report.verdict).toBe('fail');
    expect(report.postUri).toBeNull();
    expect(report.reasons).toContain(
      'The https URI includes a username, so a receiver cannot POST one-click to it.'
    );
  });

  it('rejects prose that is not an email', () => {
    expect(() => readOneClick('Please unsubscribe me from this list.')).toThrow(OneClickError);
    try {
      readOneClick('Hello: there');
    } catch (error) {
      expect(error.code).toBe('NOT_AN_EMAIL');
    }
  });

  it('rejects an empty paste and a message larger than 64 KB', () => {
    expect(() => readOneClick('   ')).toThrow(expect.objectContaining({ code: 'EMPTY_ONECLICK' }));
    expect(() => readOneClick(`Subject: Hi\n\n${'x'.repeat(64 * 1024)}`)).toThrow(
      expect.objectContaining({ code: 'ONECLICK_TOO_LARGE' })
    );
  });
});
