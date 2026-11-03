const { InviteReadError } = require('./errors');

const headerValue = (headers, name) => {
  const unfolded = String(headers || '').replace(/\r?\n[ \t]+/g, ' ');
  const match = unfolded.match(new RegExp(`^${name}:[ \\t]*([^\\r\\n]*)`, 'im'));
  return match ? match[1].trim() : null;
};

const headerMap = (headers) => {
  const unfolded = String(headers || '').replace(/\r?\n[ \t]+/g, ' ');
  const map = new Map();
  unfolded.split(/\r?\n/).forEach((line) => {
    const colon = line.indexOf(':');
    if (colon <= 0) {
      return;
    }
    const key = line.slice(0, colon).trim().toLowerCase();
    if (!map.has(key)) {
      map.set(key, line.slice(colon + 1).trim());
    }
  });
  return map;
};

const splitHeadersBody = (source) => {
  const match = String(source).match(/\r?\n\r?\n/);
  if (!match) {
    return { headers: '', body: String(source), separated: false };
  }
  return {
    headers: source.slice(0, match.index),
    body: source.slice(match.index + match[0].length),
    separated: true,
  };
};

const assertCharset = (contentType) => {
  const match = String(contentType || '').match(/charset="?([^";]+)"?/i);
  if (!match) {
    return;
  }
  const charset = match[1].trim().toLowerCase();
  if (charset !== 'utf-8' && charset !== 'us-ascii') {
    throw new InviteReadError(
      'ENCODING_UNSUPPORTED',
      'That calendar uses an encoding Invite Read does not read.'
    );
  }
};

const decodeQuotedPrintable = (input) => {
  const stripped = String(input).replace(/=\r?\n/g, '');
  const bytes = [];
  for (let i = 0; i < stripped.length; i += 1) {
    if (stripped[i] === '=' && /^[0-9A-Fa-f]{2}/.test(stripped.slice(i + 1, i + 3))) {
      bytes.push(parseInt(stripped.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(stripped.charCodeAt(i) & 0xff);
    }
  }
  return Buffer.from(bytes).toString('utf8');
};

const decodeBody = (body, encoding) => {
  const enc = String(encoding || '7bit').trim().toLowerCase();
  if (enc === '' || enc === '7bit' || enc === '8bit' || enc === 'binary') {
    return body;
  }
  if (enc === 'quoted-printable') {
    return decodeQuotedPrintable(body);
  }
  if (enc === 'base64') {
    return Buffer.from(String(body).replace(/\s+/g, ''), 'base64').toString('utf8');
  }
  throw new InviteReadError(
    'ENCODING_UNSUPPORTED',
    'That calendar uses an encoding Invite Read does not read.'
  );
};

const calendarBlock = (text) => {
  const match = String(text).match(/BEGIN:VCALENDAR\b[\s\S]*?\r?\nEND:VCALENDAR\b/i);
  return match ? match[0] : null;
};

const methodParam = (contentType) => {
  const match = String(contentType).match(/method=([^;]+)/i);
  if (!match) {
    return null;
  }
  return match[1].replace(/"/g, '').trim().toUpperCase() || null;
};

const walk = (headers, body, found) => {
  const contentType = headerValue(headers, 'content-type') || '';
  assertCharset(contentType);
  if (/multipart\//i.test(contentType)) {
    const boundaryMatch = contentType.match(/boundary="?([^";]+)"?/i);
    if (!boundaryMatch) {
      return;
    }
    body.split(`--${boundaryMatch[1]}`).forEach((chunk) => {
      const part = chunk.replace(/^\r?\n/, '');
      if (part.startsWith('--') || part.trim() === '') {
        return;
      }
      const split = splitHeadersBody(part);
      if (!split.separated) {
        return;
      }
      walk(split.headers, split.body, found);
    });
    return;
  }

  const decoded = decodeBody(body, headerValue(headers, 'content-transfer-encoding'));
  const calendar = calendarBlock(decoded);
  if (!calendar) {
    return;
  }
  const priority = /text\/calendar|application\/ics/i.test(contentType) ? 2 : 1;
  if (!found.best || priority > found.best.priority) {
    found.best = {
      calendar,
      priority,
      methodParam: methodParam(contentType),
    };
  }
};

const extractCalendar = (source) => {
  const text = String(source);
  if (/^\s*BEGIN:VCALENDAR/i.test(text)) {
    return { calendar: calendarBlock(text), headers: new Map(), methodParam: null };
  }

  const split = splitHeadersBody(text);
  const firstLine = (split.headers.split(/\r?\n/)[0] || '').trim();
  const looksLikeMessage = split.separated && /^[A-Za-z-]+:/.test(firstLine);
  if (!looksLikeMessage) {
    return { calendar: calendarBlock(text), headers: new Map(), methodParam: null };
  }

  const found = { best: null };
  walk(split.headers, split.body, found);
  return {
    calendar: found.best ? found.best.calendar : null,
    headers: headerMap(split.headers),
    methodParam: found.best ? found.best.methodParam : null,
  };
};

module.exports = {
  extractCalendar,
};
