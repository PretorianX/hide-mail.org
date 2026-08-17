/**
 * The SMTP handler stores parsedMail.text as the preview for every message. For an HTML-only
 * email mailparser derives that text through html-to-text, which merges its options with
 * deepmerge-ts and relies on the merge metadata to keep the `selectors` option intact.
 *
 * That chain is pinned by an override rather than by html-to-text's own dependency range, so
 * these tests guard the conversion against a deepmerge-ts bump silently changing it.
 */

const { simpleParser } = require('mailparser');

const rawEmail = (body, contentType) =>
  [
    'From: sender@example.com',
    'To: someone@hide-mail.org',
    'Subject: Verify your address',
    'MIME-Version: 1.0',
    `Content-Type: ${contentType}`,
    '',
    body,
  ].join('\r\n');

describe('mailparser HTML to text conversion', () => {
  it('derives readable text from an HTML-only body', async () => {
    const html = '<html><body><h1>Welcome</h1><p>Your code is <b>123456</b>.</p></body></html>';

    const parsed = await simpleParser(rawEmail(html, 'text/html; charset=utf-8'));

    expect(parsed.subject).toBe('Verify your address');
    // html-to-text upcases h1 by default.
    expect(parsed.text).toContain('WELCOME');
    expect(parsed.text).toContain('Your code is 123456.');
    expect(parsed.text).not.toContain('<b>');
  });

  it('renders a link as text plus its href, which the selectors option controls', async () => {
    const html = '<p>Click <a href="https://hide-mail.org/confirm">here</a> to confirm.</p>';

    const parsed = await simpleParser(rawEmail(html, 'text/html; charset=utf-8'));

    expect(parsed.text).toContain('here');
    expect(parsed.text).toContain('https://hide-mail.org/confirm');
  });

  it('keeps a plain text body untouched', async () => {
    const parsed = await simpleParser(rawEmail('Just plain text.', 'text/plain; charset=utf-8'));

    expect(parsed.text.trim()).toBe('Just plain text.');
  });
});
