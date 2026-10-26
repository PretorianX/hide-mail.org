/**
 * Read one delivery status notification. The source is parsed in memory and dropped.
 * Nothing here writes to Redis or disk, and nothing here probes the recipient.
 */

const { simpleParser } = require('mailparser');
const {
  parseDeliveryStatus,
  extractOriginalMessageHeaders,
  BounceReadError,
} = require('./bounceRead/parseDeliveryStatus');

const MAX_SOURCE_CHARS = 64 * 1024;

const textOf = (part) => {
  if (!part || part.content == null) {
    return '';
  }
  if (Buffer.isBuffer(part.content)) {
    return part.content.toString('utf8');
  }
  return String(part.content);
};

const sliceDeliveryStatus = (source) => {
  const text = String(source || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const marker = text.search(/content-type:\s*message\/delivery-status/i);
  if (marker < 0) {
    return '';
  }
  const after = text.slice(marker);
  const headerEnd = after.search(/\n\n/);
  if (headerEnd < 0) {
    return '';
  }
  let body = after.slice(headerEnd + 2);
  const boundary = text.match(/boundary="?([^";\r\n]+)"?/i);
  if (boundary) {
    const end = body.indexOf(`--${boundary[1]}`);
    if (end >= 0) {
      body = body.slice(0, end);
    }
  }
  return body.trim();
};

const isBareDeliveryStatus = (source) => {
  const text = String(source || '').replace(/\r\n/g, '\n');
  if (/^from:/im.test(text)) {
    return false;
  }
  const hasStatus = /^status:\s*[245]\.\d{1,3}\.\d{1,3}\b/im.test(text);
  const hasRecipient = /^(final-recipient|original-recipient):/im.test(text);
  return hasStatus && hasRecipient;
};

const extractDeliveryStatus = async (source) => {
  let parsed;
  try {
    parsed = await simpleParser(source);
  } catch (error) {
    throw new BounceReadError('NOT_A_BOUNCE', 'That text could not be read as a bounce.');
  }

  const chunks = [];
  (parsed.attachments || []).forEach((part) => {
    if (/message\/delivery-status/i.test(part.contentType || '')) {
      const text = textOf(part).trim();
      if (text) {
        chunks.push(text);
      }
    }
  });
  if (chunks.length > 0) {
    return chunks.join('\n\n');
  }

  const contentType = String(parsed.headers?.get('content-type') || '');
  if (/message\/delivery-status/i.test(contentType)) {
    return (parsed.text || source).trim();
  }

  const sliced = sliceDeliveryStatus(source);
  if (sliced) {
    return sliced;
  }
  if (isBareDeliveryStatus(source)) {
    return source;
  }
  return '';
};

const verdictOf = (recipients) => {
  const classes = new Set(recipients.map((item) => item.class));
  return classes.size === 1 ? [...classes][0] : 'mixed';
};

const summaryOf = (recipients) => {
  if (recipients.length === 1) {
    const one = recipients[0];
    const who = one.recipient;
    if (one.class === 'hard') {
      return `Hard failure. Do not retry ${who}.`;
    }
    if (one.class === 'soft') {
      return `Temporary failure. You can retry ${who}.`;
    }
    if (one.class === 'delayed') {
      return `Delivery is delayed. You can retry ${who}.`;
    }
    if (one.class === 'delivered') {
      return `Delivered to ${who}.`;
    }
    if (one.class === 'relayed') {
      return `Relayed for ${who}.`;
    }
    return `Expanded for ${who}.`;
  }

  const hard = recipients.filter((item) => item.class === 'hard').length;
  const retry = recipients.filter((item) => item.retry).length;
  if (hard > 0 && retry > 0) {
    return `${hard} hard, ${retry} still worth a retry. Stop retrying the hard failures.`;
  }
  if (hard === recipients.length) {
    return `${recipients.length} hard failures. Do not retry these addresses.`;
  }
  if (recipients.every((item) => item.retry)) {
    return `${recipients.length} temporary failures. You can retry these addresses.`;
  }
  if (recipients.every((item) => item.class === 'delivered')) {
    return `Delivered to ${recipients.length} recipients.`;
  }
  return `${recipients.length} recipients with different outcomes.`;
};

const readBounce = async (source) => {
  if (typeof source !== 'string' || source.trim() === '') {
    throw new BounceReadError('EMPTY_BOUNCE', 'Paste a bounce first.');
  }
  if (source.length > MAX_SOURCE_CHARS) {
    throw new BounceReadError('BOUNCE_TOO_LARGE', 'That bounce is larger than 64 KB.');
  }

  const deliveryStatus = await extractDeliveryStatus(source);
  if (!String(deliveryStatus || '').trim()) {
    throw new BounceReadError(
      'NOT_A_BOUNCE',
      'That text is not a delivery status notification. Paste the raw bounce, including the delivery-status part.'
    );
  }

  const parsed = parseDeliveryStatus(deliveryStatus);
  const originalMessage = extractOriginalMessageHeaders(source);
  const counts = {
    total: parsed.recipients.length,
    hard: parsed.recipients.filter((r) => r.class === 'hard').length,
    soft: parsed.recipients.filter((r) => r.class === 'soft').length,
    delayed: parsed.recipients.filter((r) => r.class === 'delayed').length,
    delivered: parsed.recipients.filter((r) => ['delivered', 'relayed', 'expanded'].includes(r.class)).length,
  };
  return {
    stored: false,
    verdict: verdictOf(parsed.recipients),
    summary: summaryOf(parsed.recipients),
    reportingMta: parsed.reportingMta,
    receivedFromMta: parsed.receivedFromMta,
    arrivalDate: parsed.arrivalDate,
    originalEnvelopeId: parsed.originalEnvelopeId,
    originalMessage,
    counts,
    recipients: parsed.recipients,
  };
};

module.exports = {
  readBounce,
  BounceReadError,
  MAX_SOURCE_CHARS,
  extractDeliveryStatus,
};
