/**
 * Offline HTML / CSS / link heuristics used by mailbox providers.
 */

const { PENALTY } = require('./findings');

const SHORTENERS = new Set([
  'bit.ly',
  't.co',
  'goo.gl',
  'tinyurl.com',
  'ow.ly',
  'is.gd',
  'buff.ly',
  'rebrand.ly',
]);

const CLOAK_CSS = /display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\.0+)?|font-size\s*:\s*0|text-indent\s*:\s*-\d|position\s*:\s*absolute[^;]*(?:left|top)\s*:\s*-\d/i;

const push = (findings, severity, id, title, detail) => {
  findings.push({
    id,
    severity,
    title,
    detail,
    penalty: severity === 'pass' ? 0 : (PENALTY[severity] || 0),
  });
};

const hostOf = (url) => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
};

const looksLikeUrl = (text) => /^https?:\/\//i.test(String(text || '').trim());

const scanShorteners = (haystack) => {
  const found = String(haystack || '').match(/https?:\/\/[^\s<>"')]+/gi) || [];
  return found.some((link) => {
    const host = hostOf(link.replace(/[.,;]+$/, ''));
    return host && SHORTENERS.has(host);
  });
};

/**
 * @param {{ html: string, text: string }} input
 */
const buildHtmlFindings = ({ html, text }) => {
  const findings = [];
  const body = String(html || '');
  const plain = String(text || '');

  if (!body.trim() && !plain.trim()) {
    return findings;
  }

  if (body && CLOAK_CSS.test(body)) {
    push(
      findings,
      'warn',
      'css_cloaking',
      'CSS hides content',
      'Styles use display:none, visibility:hidden, opacity:0, font-size:0, or off-screen positioning.'
    );
  }

  let hiddenLink = false;
  let mismatch = false;
  const shortener = scanShorteners(`${body}\n${plain}`);

  if (body) {
    const anchors = [...body.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)];
    anchors.forEach((match) => {
      const attrs = match[1] || '';
      const rawInner = String(match[2] || '');
      const hrefMatch = attrs.match(/href\s*=\s*["']([^"']+)["']/i);
      const href = hrefMatch ? hrefMatch[1] : '';
      const style = attrs.match(/style\s*=\s*["']([^"']+)["']/i);
      if ((style && CLOAK_CSS.test(style[1])) || /hidden/i.test(attrs)) {
        hiddenLink = true;
      }
      // Nested markup is not compared as a display URL.
      if (/</.test(rawInner)) {
        return;
      }
      const inner = rawInner.trim();
      const hrefHost = hostOf(href);
      if (looksLikeUrl(inner)) {
        const textHost = hostOf(inner);
        if (textHost && hrefHost && textHost !== hrefHost) {
          mismatch = true;
        }
      }
    });
  }

  if (hiddenLink) {
    push(
      findings,
      'warn',
      'hidden_link',
      'Hidden link',
      'A link is styled or attributed so recipients may not see it.'
    );
  }
  if (mismatch) {
    push(
      findings,
      'fail',
      'hidden_link_mismatch',
      'Link text disagrees with destination',
      'Visible URL text points at a different host than the href. Providers treat that as phishing.'
    );
  }
  if (shortener) {
    push(
      findings,
      'warn',
      'link_shortener',
      'URL shortener used',
      'Shortened links hide the real destination and often hurt inbox placement.'
    );
  }

  if (body && /<img\b[^>]*(?:width\s*=\s*["']?1["']?[^>]*height\s*=\s*["']?1["']?|height\s*=\s*["']?1["']?[^>]*width\s*=\s*["']?1["']?)/i.test(body)) {
    push(
      findings,
      'warn',
      'tracking_pixel',
      'Tracking pixel present',
      'A 1×1 image looks like an open tracker.'
    );
  }

  if (body && /<script\b/i.test(body)) {
    push(
      findings,
      'fail',
      'html_script',
      'Script in HTML',
      'Mailbox providers strip or block messages that embed JavaScript.'
    );
  }

  if (body && /<form\b/i.test(body)) {
    push(
      findings,
      'warn',
      'html_form',
      'HTML form present',
      'Forms inside email are unusual and often filtered.'
    );
  }

  if (body) {
    const imgCount = (body.match(/<img\b/gi) || []).length;
    const withoutImages = body.replace(/<img\b[^>]*\/?>/gi, '').replace(/\s+/g, '');
    if (imgCount > 0 && withoutImages === '' && !plain.trim()) {
      push(
        findings,
        'warn',
        'image_only_body',
        'Image-only body',
        'Add real text; image-only mail is a common spam pattern.'
      );
    }
  }

  return findings;
};

module.exports = {
  buildHtmlFindings,
  SHORTENERS,
};
