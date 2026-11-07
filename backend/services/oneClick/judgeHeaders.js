/**
 * One-Click judges RFC 8058 one-click unsubscribe headers.
 * It does not fetch the URI, send the POST, or store the message.
 *
 * A pass requires both:
 * - an https URI in List-Unsubscribe (mailto or http alone is not enough)
 * - List-Unsubscribe-Post: List-Unsubscribe=One-Click
 */

const MAX_SOURCE_CHARS = 64 * 1024;
const POST_VALUE = 'List-Unsubscribe=One-Click';

const MAIL_HEADERS = new Set([
  'from',
  'to',
  'cc',
  'bcc',
  'subject',
  'date',
  'message-id',
  'mime-version',
  'content-type',
  'list-unsubscribe',
  'list-unsubscribe-post',
  'return-path',
  'received',
  'sender',
  'reply-to',
  'list-id',
  'dkim-signature',
  'authentication-results',
]);

class OneClickError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'OneClickError';
    this.code = code;
  }
}

const headerBlockOf = (source) => {
  const normalized = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const splitAt = normalized.indexOf('\n\n');
  const block = splitAt === -1 ? normalized : normalized.slice(0, splitAt);
  return block.replace(/\n[ \t]+/g, ' ');
};

const parseHeaders = (block) => {
  const headers = new Map();
  let sawHeader = false;

  block.split('\n').forEach((line) => {
    if (!line.trim()) {
      return;
    }
    const match = line.match(/^([A-Za-z][A-Za-z0-9-]*)\s*:\s*(.*)$/);
    if (!match) {
      return;
    }
    sawHeader = true;
    const name = match[1].toLowerCase();
    const value = match[2].trim();
    const current = headers.get(name) || [];
    current.push(value);
    headers.set(name, current);
  });

  if (!sawHeader) {
    return null;
  }
  return headers;
};

const classifyUri = (raw) => {
  const value = String(raw || '').trim();
  let url;
  try {
    url = new URL(value);
  } catch {
    return { kind: 'invalid', value };
  }
  const protocol = url.protocol.toLowerCase();
  if (protocol === 'https:') {
    if (url.username || url.password) {
      return { kind: 'https-userinfo', value };
    }
    return { kind: 'https', value: url.toString() };
  }
  if (protocol === 'http:') {
    return { kind: 'http', value: url.toString() };
  }
  if (protocol === 'mailto:') {
    return { kind: 'mailto', value };
  }
  return { kind: 'other', value };
};

const urisIn = (values) => {
  const found = [];
  values.forEach((value) => {
    const pattern = /<([^<>]+)>/g;
    let match = pattern.exec(value);
    while (match) {
      found.push(classifyUri(match[1]));
      match = pattern.exec(value);
    }
  });
  return found;
};

const valuesOf = (headers, name) => headers.get(name) || [];

/**
 * @param {string} source
 * @returns {object}
 */
const judgeOneClick = (source) => {
  if (typeof source !== 'string' || !source.trim()) {
    throw new OneClickError('EMPTY_ONECLICK', 'Paste a message first.');
  }
  if (source.length > MAX_SOURCE_CHARS) {
    throw new OneClickError('ONECLICK_TOO_LARGE', 'That message is larger than 64 KB.');
  }
  if (source.includes('\0')) {
    throw new OneClickError('NOT_AN_EMAIL', 'That paste is not an email.');
  }

  const headers = parseHeaders(headerBlockOf(source));
  if (!headers || ![...headers.keys()].some((name) => MAIL_HEADERS.has(name))) {
    throw new OneClickError('NOT_AN_EMAIL', 'That paste is not an email.');
  }

  const listValues = valuesOf(headers, 'list-unsubscribe');
  const postValues = valuesOf(headers, 'list-unsubscribe-post');
  const uris = urisIn(listValues);
  const httpsUris = uris.filter((item) => item.kind === 'https').map((item) => item.value);
  const userinfoUris = uris.filter((item) => item.kind === 'https-userinfo').map((item) => item.value);
  const httpUris = uris.filter((item) => item.kind === 'http').map((item) => item.value);
  const mailtoUris = uris.filter((item) => item.kind === 'mailto').map((item) => item.value);
  const postExact = postValues.some((value) => value.trim() === POST_VALUE);
  const reasons = [];

  if (listValues.length === 0) {
    reasons.push('List-Unsubscribe is missing.');
  } else if (uris.length === 0) {
    reasons.push('List-Unsubscribe has no URI in angle brackets.');
  }

  if (httpsUris.length === 0) {
    if (userinfoUris.length > 0) {
      reasons.push('The https URI includes a username, so a receiver cannot POST one-click to it.');
    } else if (httpUris.length > 0) {
      reasons.push('One-click needs an https URI. This message only offers http.');
    } else if (mailtoUris.length > 0) {
      reasons.push('One-click needs an https URI. This message only offers mailto.');
    } else if (listValues.length > 0 && uris.length > 0) {
      reasons.push('List-Unsubscribe has no https URI.');
    }
  }

  if (postValues.length === 0) {
    reasons.push('List-Unsubscribe-Post is missing.');
  } else if (!postExact) {
    reasons.push('List-Unsubscribe-Post must be exactly List-Unsubscribe=One-Click.');
  }

  const pass = httpsUris.length > 0 && postExact;
  const postUri = httpsUris[0] || null;

  return {
    stored: false,
    verdict: pass ? 'pass' : 'fail',
    stamp: pass ? 'PASS' : 'FAIL',
    summary: pass
      ? `A receiver can POST one-click to ${postUri}.`
      : 'This message does not meet the one-click rule.',
    postUri,
    httpsUris,
    mailtoUris,
    httpUris,
    postHeader: postExact ? POST_VALUE : (postValues[0] || null),
    reasons: pass ? [] : reasons,
  };
};

module.exports = {
  judgeOneClick,
  OneClickError,
  MAX_SOURCE_CHARS,
  POST_VALUE,
};
