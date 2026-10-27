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

const FEEDBACK_EXPLANATION = {
  abuse: 'The recipient clicked "Report Spam" or "Junk" in their mailbox client (RFC 5965 abuse feedback loop).',
  fraud: 'The message was flagged as phishing, spoofing, or financial fraud.',
  virus: 'The receiving filter detected malware or a virus payload in the message.',
  'not-spam': 'The recipient explicitly marked the message as "Not Spam", confirming they want future mail.',
  'auth-failure': 'An automated authentication check (SPF, DKIM, or DMARC) failed at the receiving gateway.',
  other: 'A general feedback report that does not fall into standard abuse or authentication categories.',
};

const WORKFLOW_STEPS = {
  suppress: [
    'Add the recipient address to your global suppression list immediately so no future campaigns are sent.',
    'Record the Source-IP, Arrival-Date, and User-Agent in your compliance audit log.',
    'Monitor domain complaint rate to stay well below the 0.1% Google/Yahoo postmaster threshold.',
  ],
  keep: [
    'Ensure the recipient address is active and cleared from any temporary suppression queue.',
    'Log the positive engagement signal from the feedback loop.',
  ],
  review: [
    'Do not suppress the recipient address automatically — this report was not a user spam complaint.',
    'Inspect Authentication-Results, Source-IP, and DKIM-Domain to fix any misconfigured sending infrastructure.',
  ],
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

const extractOriginalMessage = (parts) => {
  const originalPart = parts.find((part) => {
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
    return /(?:message\/rfc822|text\/rfc822-headers)/i.test(partType);
  });
  if (!originalPart) {
    return null;
  }
  let partHeaders;
  let decoded;
  try {
    partHeaders = parseFieldBlock(originalPart.headers);
    const encoding = one(partHeaders, 'content-transfer-encoding', 'Content-Transfer-Encoding');
    decoded = decodeBody(originalPart.body, encoding);
  } catch (error) {
    if (error instanceof ComplaintReadError) {
      return null;
    }
    throw error;
  }
  const { headers: msgHeaderBlock } = splitOuter(decoded);
  let msgFields;
  try {
    msgFields = parseFieldBlock(msgHeaderBlock);
  } catch (error) {
    if (error instanceof ComplaintReadError) {
      return null;
    }
    throw error;
  }
  const rawMessageId = (msgFields.get('message-id') || [])[0] || null;
  const rawSubject = (msgFields.get('subject') || [])[0] || null;
  const rawListUnsub = (msgFields.get('list-unsubscribe') || [])[0] || null;

  const messageId = rawMessageId ? rawMessageId.trim().slice(0, MAX_FIELD_CHARS) : null;
  const subject = rawSubject ? rawSubject.trim().slice(0, 160) : null;
  const listUnsubscribe = Boolean(rawListUnsub && rawListUnsub.trim().length > 0);

  if (!messageId && !subject && !listUnsubscribe) {
    return null;
  }
  return {
    messageId,
    subject,
    listUnsubscribe,
  };
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
  return {
    fields: parseFieldBlock(decodeBody(part.body, encoding)),
    originalMessage: extractOriginalMessage(parts),
  };
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

const optionalRepeatable = (fields, name) => {
  const values = fields.get(name) || [];
  const filtered = values
    .map((v) => v.trim())
    .filter((v) => v.length > 0 && !/[\u0000-\u001F\u007F]/.test(v));
  return filtered.length > 0 ? filtered : null;
};

const verdictFrom = ({ fields, originalMessage = null }) => {
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

  const rawIncidents = one(fields, 'incidents', 'Incidents');
  let incidents = 1;
  if (rawIncidents != null) {
    const trimmed = rawIncidents.trim();
    if (!/^\d+$/.test(trimmed) || Number(trimmed) < 1 || Number(trimmed) > 1000000) {
      fail('BAD_FIELD', 'Incidents is not a positive count.');
    }
    incidents = Number(trimmed);
  }

  const receivedDate = plainField('Received-Date', one(fields, 'received-date', 'Received-Date'));
  const arrivalDate = plainField('Arrival-Date', one(fields, 'arrival-date', 'Arrival-Date'));

  return {
    stored: false,
    stamp: known.stamp,
    feedbackType,
    feedbackExplanation: FEEDBACK_EXPLANATION[feedbackType],
    action: known.action,
    actionLabel: ACTION_LABEL[known.action],
    workflow: WORKFLOW_STEPS[known.action],
    recipient,
    mailFrom,
    sourceIp,
    reportedDomain,
    reportedUri: optionalRepeatable(fields, 'reported-uri'),
    userAgent: plainField('User-Agent', one(fields, 'user-agent', 'User-Agent')),
    version: plainField('Version', one(fields, 'version', 'Version')),
    incidents,
    originalEnvelopeId: optionalRepeatable(fields, 'original-envelope-id'),
    authenticationResults: optionalRepeatable(fields, 'authentication-results'),
    dkimDomain: plainField('DKIM-Domain', one(fields, 'dkim-domain', 'DKIM-Domain')),
    receivedDate,
    arrivalDate,
    originalMessage,
    suppressionRecord: {
      email: recipient,
      action: known.action,
      reason: `arf_${feedbackType}`,
      domain: reportedDomain,
      sourceIp,
      messageId: originalMessage?.messageId || null,
      arrivalDate: arrivalDate || receivedDate || null,
    },
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
    return {
      fields: parseFieldBlock(decodeBody(body, encoding)),
      originalMessage: null,
    };
  }
  if (outer.has('feedback-type')) {
    return {
      fields: outer,
      originalMessage: null,
    };
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
