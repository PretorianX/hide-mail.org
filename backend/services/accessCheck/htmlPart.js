/**
 * Take either an HTML document or a raw message and return the HTML part.
 * The bytes are decoded in memory. Nothing is written.
 */

const { fail } = require('./errors');

const NOT_HTML = 'Paste the HTML of an email, or a raw message that contains an HTML part.';
const NO_PART = 'That message has no HTML part.';

const EMAIL_TAG = /<\s*\/?\s*(?:html|head|body|table|div|p|img|a|span|h[1-6]|td|tr|center|font|ul|ol|li|br|strong|em|title|style)\b/i;
const HEADER_LINE = /^[A-Za-z][A-Za-z0-9-]*:/;

const decodeQuotedPrintable = (input) => {
  const stripped = String(input).replace(/=\r?\n/g, '');
  const bytes = [];
  for (let index = 0; index < stripped.length; index += 1) {
    const pair = stripped.slice(index + 1, index + 3);
    if (stripped[index] === '=' && /^[0-9A-Fa-f]{2}$/.test(pair)) {
      bytes.push(parseInt(pair, 16));
      index += 2;
    } else {
      bytes.push(stripped.charCodeAt(index) & 0xff);
    }
  }
  return Buffer.from(bytes).toString('utf8');
};

const decodeBody = (body, encoding) => {
  const transfer = String(encoding || '7bit').split(';')[0].trim().toLowerCase();
  if (transfer === 'base64') {
    return Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
  }
  if (transfer === 'quoted-printable') {
    return decodeQuotedPrintable(body);
  }
  return body;
};

const headerMap = (block) => {
  const headers = {};
  block.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/).forEach((line) => {
    const splitAt = line.indexOf(':');
    if (splitAt < 1) {
      return;
    }
    const name = line.slice(0, splitAt).trim().toLowerCase();
    if (!headers[name]) {
      headers[name] = line.slice(splitAt + 1).trim();
    }
  });
  return headers;
};

const splitHeadBody = (source) => {
  const match = source.match(/\r?\n\r?\n/);
  if (!match) {
    return { head: source, body: '' };
  }
  return {
    head: source.slice(0, match.index),
    body: source.slice(match.index + match[0].length),
  };
};

const boundaryOf = (contentType) => {
  const match = String(contentType).match(/boundary\s*=\s*(?:"([^"]+)"|'([^']+)'|([^;\s]+))/i);
  if (!match) {
    return null;
  }
  return match[1] || match[2] || match[3];
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const htmlFromPart = (head, body) => {
  const headers = headerMap(head);
  const contentType = headers['content-type'] || '';
  if (/multipart\//i.test(contentType)) {
    const boundary = boundaryOf(contentType);
    if (!boundary) {
      fail('NOT_HTML', NO_PART);
    }
    const pieces = body.split(new RegExp(`--${escapeRegExp(boundary)}`));
    for (const piece of pieces) {
      const trimmed = piece.replace(/^\r?\n/, '');
      if (!trimmed || trimmed.startsWith('--')) {
        continue;
      }
      const part = splitHeadBody(trimmed);
      const found = htmlFromPart(part.head, part.body);
      if (found) {
        return found;
      }
    }
    return null;
  }
  if (/text\/html/i.test(contentType)) {
    return decodeBody(body, headers['content-transfer-encoding']);
  }
  return null;
};

const htmlFromSource = (source) => {
  const trimmed = source.trim().replace(/^\uFEFF/, '');
  if (!trimmed) {
    fail('EMPTY_ACCESS', "Paste an email's HTML first.");
  }
  if (trimmed.startsWith('<')) {
    if (!EMAIL_TAG.test(trimmed)) {
      fail('NOT_HTML', NOT_HTML);
    }
    return trimmed;
  }
  const firstLine = trimmed.split(/\r?\n/, 1)[0];
  if (!HEADER_LINE.test(firstLine)) {
    fail('NOT_HTML', NOT_HTML);
  }
  const message = splitHeadBody(trimmed);
  const html = htmlFromPart(message.head, message.body);
  if (!html || !html.trim()) {
    fail('NOT_HTML', NO_PART);
  }
  if (!EMAIL_TAG.test(html) && !/<\s*[a-z!]/i.test(html)) {
    fail('NOT_HTML', NO_PART);
  }
  return html;
};

module.exports = {
  htmlFromSource,
  decodeQuotedPrintable,
};
