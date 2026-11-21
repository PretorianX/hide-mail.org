const { readAccess, AccessCheckError } = require('../../services/accessCheckService');

const clearHtml = [
  '<html lang="en">',
  '<body style="color:#111111;background-color:#ffffff;font-size:16px">',
  '<h1>November update</h1>',
  '<p>Your order shipped today.</p>',
  '<p><a href="https://shop.example/order">Track the order</a></p>',
  '<img src="logo.png" alt="Northwind">',
  '</body>',
  '</html>',
].join('');

describe('Access Check', () => {
  it('stamps CLEAR when the HTML can be read', () => {
    const report = readAccess(clearHtml);

    expect(report).toMatchObject({
      stored: false,
      stamp: 'CLEAR',
      verdict: 'clear',
      barrierCount: 0,
      barriers: [],
    });
    expect(report.summary).toMatch(/no access barrier/i);
  });

  it('names each barrier and does not keep the source', () => {
    const html = [
      '<html>',
      '<body style="color:#999999;background-color:#ffffff;font-size:12px">',
      '<h1>Update</h1>',
      '<h3>Details</h3>',
      '<p>secret-token-access <a href="https://shop.example/order"></a></p>',
      '<img src="logo.png">',
      '</body>',
      '</html>',
    ].join('');

    const report = readAccess(html);

    expect(report.stamp).toBe('FIX');
    expect(report.barriers.map((item) => item.id)).toEqual([
      'missing-alt',
      'unnamed-link',
      'missing-language',
      'low-contrast',
      'small-type',
      'skipped-heading',
    ]);
    expect(report.barriers.find((item) => item.id === 'low-contrast').count).toBe(3);
    expect(report.barriers.find((item) => item.id === 'small-type').count).toBe(3);
    expect(report.barrierCount).toBe(10);
    expect(JSON.stringify(report)).not.toContain('secret-token-access');
    expect(JSON.stringify(report)).not.toContain('shop.example');
  });

  it('blocks an email that is only an image', () => {
    const report = readAccess('<html lang="en"><body><img src="banner.png" alt=""></body></html>');

    expect(report.stamp).toBe('BLOCKED');
    expect(report.verdict).toBe('blocked');
    expect(report.barriers.map((item) => item.id)).toEqual(['image-only']);
    expect(report.summary).toMatch(/only an image/i);
  });

  it('treats an image alt as text a screen reader can speak', () => {
    const report = readAccess('<html lang="en"><body><img src="logo.png" alt="Northwind sale"></body></html>');

    expect(report.stamp).toBe('CLEAR');
  });

  it('reads a font tag the way an email client does', () => {
    const small = readAccess('<html lang="en"><body bgcolor="#ffffff"><font color="#999999" size="2">Sale ends tonight</font></body></html>');
    const readable = readAccess('<html lang="en"><body bgcolor="#ffffff"><font color="#111111" size="3">Sale ends tonight</font></body></html>');

    expect(small.barriers.map((item) => item.id)).toEqual(['low-contrast', 'small-type']);
    expect(readable.stamp).toBe('CLEAR');
  });

  it('accepts a language set on the fragment rather than an html tag', () => {
    const report = readAccess('<div lang="en"><p style="font-size:16px">The workshop starts at nine.</p></div>');

    expect(report.stamp).toBe('CLEAR');
  });

  it('reads the HTML part of a raw message and ignores the plain part', () => {
    const source = [
      'From: Ada <ada@example.com>',
      'To: Bea <bea@example.com>',
      'Subject: Order',
      'MIME-Version: 1.0',
      'Content-Type: multipart/alternative; boundary="line"',
      '',
      '--line',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'secret-plain-part',
      '--line',
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      '<html lang=3D"en"><body style=3D"font-size:16px"><p>Your order shipped.</p></body></html>',
      '--line--',
      '',
    ].join('\r\n');

    const report = readAccess(source);

    expect(report.stamp).toBe('CLEAR');
    expect(JSON.stringify(report)).not.toContain('secret-plain-part');
    expect(JSON.stringify(report)).not.toContain('ada@example.com');
  });

  it('decodes a base64 HTML part', () => {
    const html = '<html lang="en"><body><p>Your ticket is ready.</p></body></html>';
    const source = [
      'From: Ada <ada@example.com>',
      'Subject: Ticket',
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(html, 'utf8').toString('base64'),
      '',
    ].join('\n');

    expect(readAccess(source).stamp).toBe('CLEAR');
  });

  it('rejects prose, JSON, XML, and a message with no HTML part', () => {
    expect(() => readAccess('Hello, this is a note about the meeting.')).toThrow(AccessCheckError);
    expect(() => readAccess('{"policies":[]}')).toThrow(
      expect.objectContaining({ code: 'NOT_HTML' })
    );
    expect(() => readAccess('<feedback><report_metadata></report_metadata></feedback>')).toThrow(
      expect.objectContaining({ code: 'NOT_HTML' })
    );

    const plain = [
      'From: Ada <ada@example.com>',
      'Subject: Hi',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Just writing to say hello.',
    ].join('\n');
    expect(() => readAccess(plain)).toThrow(
      expect.objectContaining({ code: 'NOT_HTML', message: 'That message has no HTML part.' })
    );
  });

  it('rejects an empty paste and HTML with nothing to check', () => {
    expect(() => readAccess('   ')).toThrow(
      expect.objectContaining({ code: 'EMPTY_ACCESS' })
    );
    expect(() => readAccess('<html lang="en"><body></body></html>')).toThrow(
      expect.objectContaining({ code: 'NOT_HTML', message: 'That HTML has nothing to check.' })
    );
  });

  it('rejects a paste larger than 64 KB', () => {
    const source = `<html lang="en"><body><p>${'a'.repeat(70 * 1024)}</p></body></html>`;

    expect(() => readAccess(source)).toThrow(
      expect.objectContaining({ code: 'ACCESS_TOO_LARGE' })
    );
  });

  it('counts a named link once and leaves a described image alone', () => {
    const report = readAccess([
      '<html lang="en"><body style="font-size:16px">',
      '<a href="https://shop.example/sale"><img src="sale.png" alt="Spring sale"></a>',
      '<p>Ends Sunday.</p>',
      '</body></html>',
    ].join(''));

    expect(report.stamp).toBe('CLEAR');
  });
});
