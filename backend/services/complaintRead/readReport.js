/**
 * Read one RFC 5965 abuse feedback report.
 * The source is parsed in memory and dropped. Nothing here writes to Redis or disk.
 */

const MAX_SOURCE_CHARS = 64 * 1024;
const MAX_FIELD_CHARS = 200;

const FEEDBACK = {
  abuse: { stamp: 'ABUSE', action: 'suppress' },
  fraud: { stamp: 'FRAUD', action: 'suppress' },
  virus: { stamp: 'VIRUS', action: 'suppress' },
  'not-spam': { stamp: 'NOT-SPAM', action: 'keep' },
  'auth-failure': { stamp: 'AUTH', action: 'review' },
  other: { stamp: 'OTHER', action: 'review' },
};

const ACTION_LABEL = {
  suppress: 'Remove this address from the list.',
  keep: 'Keep this address. The receiver said this mail was wanted.',
  review: 'Do not remove this address automatically.',
};

const EMAIL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const DOMAIN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
const HEADER_LINE = /^([A-Za-z][A-Za-z0-9-]*)\s*:\s*(.*)$/;

class ComplaintReadError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new ComplaintReadError(code, message);
};

const notAComplaint = (message) => fail(
  'NOT_A_COMPLAINT',
  message || 'That text is not an abuse feedback report.'
);

const splitOuter = (raw) => {
  const match = String(raw).match(/\r?\n\r?\n/);
  if (!match) {
    return { headers: String(raw), body: '' };
  }
  return {
    headers: String(raw).slice(0, match.index),
    body: String(raw).slice(match.index + match[0].length),
  };
};

const parseFieldBlock = (raw) => {
  const unfolded = String(raw || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r?\n[ \t]+/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/^(?:[ \t]*\n)+/, '');
  const fields = new Map();
  const lines = unfolded.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === '') {
      break;
    }
    const match = line.match(HEADER_LINE);
    if (!match) {
      notAComplaint();
    }
    const name = match[1].toLowerCase();
    const list = fields.get(name) || [];
    list.push(match[2].trim());
    fields.set(name, list);
  }
  return fields;
};

const one = (fields, name, label) => {
  const values = fields.get(name) || [];
  if (values.length > 1) {
    fail('BAD_FIELD', `${label} is repeated.`);
  }
  return values.length === 0 ? null : values[0];
};

const reportTypeOf = (contentType) => {
  const match = String(contentType || '').match(/report-type\s*=\s*"?([a-z0-9-]+)"?/i);
  return match ? match[1].toLowerCase() : '';
};

const boundaryOf = (contentType) => {
  const match = String(contentType || '').match(/boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/i);
  if (!match) {
    notAComplaint();
  }
  return match[1] || match[2];
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const decodeQuotedPrintable = (input) => {
  const bytes = [];
  const text = input.replace(/=\r?\n/g, '');
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '=' && /^[0-9A-F]{2}/i.test(text.slice(i + 1, i + 3))) {
      bytes.push(parseInt(text.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      const code = text.charCodeAt(i);
      if (code > 255) {
        notAComplaint();
      }
      bytes.push(code);
    }
  }
  return Buffer.from(bytes).toString('utf8');
};

const decodeBody = (body, encoding) => {
  const token = String(encoding || '7bit').split(';')[0].trim().toLowerCase();
  if (token === '7bit' || token === '8bit' || token === 'binary') {
    return body;
  }
  if (token === 'base64') {
    return Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
  }
  if (token === 'quoted-printable') {
    return decodeQuotedPrintable(body);
  }
  notAComplaint();
};

const splitParts = (body, boundary) => {
  const marker = `--${boundary}`;
  const normalized = body.startsWith(marker) ? `\n${body}` : body;
  const pieces = normalized.split(new RegExp(`(?:\\r?\\n)--${escapeRegExp(boundary)}`));
  const parts = [];
  pieces.slice(1).forEach((piece) => {
    if (piece.startsWith('--')) {
      return;
    }
    parts.push(splitOuter(piece.replace(/^\r?\n/, '')));
  });
  return parts;
};

const fieldsFromMultipart = (body, contentType) => {
  const parts = splitParts(body, boundaryOf(contentType));
  const feedbackParts = parts.filter((part) => {
    let headers;
    try {
      headers = parseFieldBlock(part.headers);
    } catch (error) {
      if (error instanceof ComplaintReadError) {
        return false;
      }
      throw error;
    }
    const partType = one(headers, 'content-type', 'Content-Type') || '';
    return /message\/feedback-report/i.test(partType);
  });
  if (feedbackParts.length === 0) {
    notAComplaint();
  }
  if (feedbackParts.length > 1) {
    fail('BAD_FIELD', 'The report has more than one feedback-report part.');
  }
  const part = feedbackParts[0];
  const headers = parseFieldBlock(part.headers);
  const encoding = one(headers, 'content-transfer-encoding', 'Content-Transfer-Encoding');
  return parseFieldBlock(decodeBody(part.body, encoding));
};

const isIpv4 = (value) => {
  const parts = value.split('.');
  if (parts.length !== 4) {
    return false;
  }
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255 && String(Number(part)) === part);
};

const isIpv6 = (value) => {
  if (value.includes('.') || !/^[0-9a-f:]+$/i.test(value)) {
    return false;
  }
  const lower = value.toLowerCase();
  if (lower.split('::').length > 2) {
    return false;
  }
  const halves = lower.split('::');
  const groups = halves.map((half) => (half === '' ? [] : half.split(':')));
  if (groups.some((group) => group.some((part) => part.length === 0 || part.length > 4))) {
    return false;
  }
  const count = groups.reduce((sum, group) => sum + group.length, 0);
  if (halves.length === 1) {
    return count === 8;
  }
  return count < 8;
};

const addressFrom = (value) => {
  const stripped = String(value || '').trim().replace(/^rfc822\s*;\s*/i, '').trim();
  const angle = stripped.match(/^<([^<>]+)>$/);
  const candidate = (angle ? angle[1] : stripped).trim().toLowerCase();
  if (!EMAIL.test(candidate) || candidate.length > MAX_FIELD_CHARS) {
    return null;
  }
  return candidate;
};

const plainField = (label, value) => {
  if (value == null) {
    return null;
  }
  const text = value.trim();
  if (text.length === 0 || text.length > MAX_FIELD_CHARS || /[\u0000-\u001F\u007F]/.test(text)) {
    fail('BAD_FIELD', `${label} is not a plain value.`);
  }
  return text;
};

const verdictFrom = (fields) => {
  const rawType = one(fields, 'feedback-type', 'Feedback-Type');
  if (!rawType) {
    notAComplaint();
  }
  const feedbackType = rawType.trim().toLowerCase();
  const known = FEEDBACK[feedbackType];
  if (!known) {
    fail('BAD_FIELD', 'Feedback-Type is not one Complaint Read acts on.');
  }

  const rawRcpt = one(fields, 'original-rcpt-to', 'Original-Rcpt-To');
  if (!rawRcpt) {
    fail('NO_RECIPIENT', 'This complaint does not name an address to suppress.');
  }
  const recipient = addressFrom(rawRcpt);
  if (!recipient) {
    fail('BAD_FIELD', 'Original-Rcpt-To is not an email address.');
  }

  const rawMailFrom = one(fields, 'original-mail-from', 'Original-Mail-From');
  const mailFrom = rawMailFrom ? addressFrom(rawMailFrom) : null;
  if (rawMailFrom && !mailFrom) {
    fail('BAD_FIELD', 'Original-Mail-From is not an email address.');
  }

  const rawIp = one(fields, 'source-ip', 'Source-IP');
  let sourceIp = null;
  if (rawIp) {
    const candidate = rawIp.trim();
    if (!isIpv4(candidate) && !isIpv6(candidate)) {
      fail('BAD_FIELD', 'Source-IP is not an IP address.');
    }
    sourceIp = candidate.toLowerCase();
  }

  const rawDomain = one(fields, 'reported-domain', 'Reported-Domain');
  let reportedDomain = null;
  if (rawDomain) {
    const candidate = rawDomain.trim().replace(/\.$/, '').toLowerCase();
    if (!DOMAIN.test(candidate)) {
      fail('BAD_FIELD', 'Reported-Domain is not a domain name.');
    }
    reportedDomain = candidate;
  }

  return {
    stored: false,
    stamp: known.stamp,
    feedbackType,
    action: known.action,
    actionLabel: ACTION_LABEL[known.action],
    recipient,
    mailFrom,
    sourceIp,
    reportedDomain,
    userAgent: plainField('User-Agent', one(fields, 'user-agent', 'User-Agent')),
    receivedDate: plainField('Received-Date', one(fields, 'received-date', 'Received-Date')),
    arrivalDate: plainField('Arrival-Date', one(fields, 'arrival-date', 'Arrival-Date')),
  };
};

const fieldBlockFor = (source) => {
  const { headers, body } = splitOuter(source);
  const outer = parseFieldBlock(headers);
  const contentType = one(outer, 'content-type', 'Content-Type') || '';
  const reportType = reportTypeOf(contentType);

  if (reportType === 'delivery-status') {
    notAComplaint('That is a delivery status, not an abuse complaint.');
  }
  if (/multipart\//i.test(contentType)) {
    if (reportType !== 'feedback-report') {
      notAComplaint();
    }
    return fieldsFromMultipart(body, contentType);
  }
  if (/message\/feedback-report/i.test(contentType)) {
    const encoding = one(outer, 'content-transfer-encoding', 'Content-Transfer-Encoding');
    return parseFieldBlock(decodeBody(body, encoding));
  }
  if (outer.has('feedback-type')) {
    return outer;
  }
  if (outer.has('action') && outer.has('status')) {
    notAComplaint('That is a delivery status, not an abuse complaint.');
  }
  notAComplaint();
};

const readComplaint = (source) => {
  if (typeof source !== 'string' || source.trim() === '') {
    fail('EMPTY_COMPLAINT', 'Paste a feedback report first.');
  }
  const text = source.replace(/^\uFEFF/, '');
  if (text.length > MAX_SOURCE_CHARS) {
    fail('COMPLAINT_TOO_LARGE', 'That complaint is larger than 64 KB.');
  }
  return verdictFrom(fieldBlockFor(text));
};

module.exports = {
  readComplaint,
  ComplaintReadError,
  MAX_SOURCE_CHARS,
};
