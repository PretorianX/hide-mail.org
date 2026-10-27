/**
 * Parse one message/delivery-status body (RFC 3464) into per-recipient records,
 * and safely extract original campaign headers from message/rfc822 or text/rfc822-headers
 * without reading or echoing the original message body.
 */

const { explainStatus } = require('./statusCatalog');
const { matchDiagnostic, isGenericStatus } = require('./diagnosticPatterns');

class BounceReadError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const unfold = (text) => String(text || '')
  .replace(/\r\n/g, '\n')
  .replace(/\r/g, '\n')
  .replace(/\n[ \t]+/g, ' ');

const parseFields = (block) => {
  const fields = new Map();
  block.split('\n').forEach((line) => {
    const match = line.match(/^([A-Za-z][A-Za-z0-9-]*)\s*:\s*(.*)$/);
    if (!match) {
      return;
    }
    const name = match[1].toLowerCase();
    const value = match[2].trim();
    const previous = fields.get(name);
    fields.set(name, previous ? `${previous} ${value}` : value);
  });
  return fields;
};

const addressOf = (value) => {
  if (!value) {
    return '';
  }
  const semicolon = value.indexOf(';');
  const raw = (semicolon >= 0 ? value.slice(semicolon + 1) : value).trim();
  return raw.replace(/^<|>$/g, '').trim();
};

const statusOf = (value) => {
  const match = String(value || '').match(/\b([245]\.\d{1,3}\.\d{1,3})\b/);
  return match ? match[1] : '';
};

const parseDiagnostic = (raw) => {
  const text = String(raw || '').trim();
  if (!text) {
    return { diagnosticType: null, smtpCode: null, cleanDiagnostic: '' };
  }
  const semi = text.indexOf(';');
  const diagnosticType = semi >= 0 ? text.slice(0, semi).trim().toLowerCase() : null;
  const cleanDiagnostic = (semi >= 0 ? text.slice(semi + 1) : text).trim();
  const smtpMatch = cleanDiagnostic.match(/\b([245]\d{2})\b/);
  return {
    diagnosticType: diagnosticType || null,
    smtpCode: smtpMatch ? smtpMatch[1] : null,
    cleanDiagnostic,
  };
};

/**
 * Safely extract only campaign headers from a message/rfc822 or text/rfc822-headers MIME part.
 * Stops before the first blank line inside the embedded message so the body is never read.
 */
const extractOriginalMessageHeaders = (rawSource) => {
  const text = String(rawSource || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const partMatch = text.match(/content-type:\s*(?:message\/rfc822|text\/rfc822-headers)\b[^\n]*/i);
  if (!partMatch || partMatch.index == null) {
    return null;
  }

  const afterPartHeader = text.slice(partMatch.index);
  const partHeaderEnd = afterPartHeader.indexOf('\n\n');
  if (partHeaderEnd < 0) {
    return null;
  }

  let embedded = afterPartHeader.slice(partHeaderEnd + 2);
  const boundaryMatch = text.match(/boundary="?([^";\n]+)"?/i);
  if (boundaryMatch) {
    const boundaryMarker = `--${boundaryMatch[1]}`;
    const boundaryPos = embedded.indexOf(boundaryMarker);
    if (boundaryPos >= 0) {
      embedded = embedded.slice(0, boundaryPos);
    }
  }

  // Trim leading blank lines if any before the embedded RFC822 header block, then stop before first blank line
  const trimmedStart = embedded.replace(/^\n+/, '');
  const headerBlockEnd = trimmedStart.indexOf('\n\n');
  const headerOnlyBlock = headerBlockEnd >= 0 ? trimmedStart.slice(0, headerBlockEnd) : trimmedStart;

  const fields = parseFields(unfold(headerOnlyBlock));
  const messageId = fields.get('message-id') || null;
  const subject = fields.get('subject') || null;
  const from = fields.get('from') || null;
  const date = fields.get('date') || null;
  const listUnsubscribe = fields.get('list-unsubscribe') || null;

  if (!messageId && !subject && !from && !date && !listUnsubscribe) {
    return null;
  }

  return {
    messageId,
    subject,
    from,
    date,
    listUnsubscribe,
  };
};

const parseDeliveryStatus = (text) => {
  const unfolded = unfold(text).trim();
  if (!unfolded) {
    throw new BounceReadError(
      'NOT_A_BOUNCE',
      'That text is not a delivery status notification. Paste the raw bounce, including the delivery-status part.'
    );
  }

  const blocks = unfolded.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  let reportingMta = null;
  let receivedFromMta = null;
  let arrivalDate = null;
  let originalEnvelopeId = null;
  const recipients = [];

  blocks.forEach((block) => {
    const fields = parseFields(block);
    const reporting = fields.get('reporting-mta');
    if (reporting && !reportingMta) {
      reportingMta = reporting;
    }
    const receivedFrom = fields.get('received-from-mta');
    if (receivedFrom && !receivedFromMta) {
      receivedFromMta = receivedFrom;
    }
    const arrival = fields.get('arrival-date');
    if (arrival && !arrivalDate) {
      arrivalDate = arrival;
    }
    const envId = fields.get('original-envelope-id');
    if (envId && !originalEnvelopeId) {
      originalEnvelopeId = envId;
    }
    const status = statusOf(fields.get('status'));
    if (!status) {
      return;
    }
    const recipient = addressOf(fields.get('final-recipient') || fields.get('original-recipient'));
    if (!recipient) {
      throw new BounceReadError('NOT_A_BOUNCE', 'That bounce names no recipient.');
    }
    const originalRecipient = addressOf(fields.get('original-recipient')) || null;
    const action = fields.get('action') || '';
    const diagnostic = fields.get('diagnostic-code') || '';
    const remoteMta = fields.get('remote-mta') || '';
    const parsedDiag = parseDiagnostic(diagnostic);
    const explained = explainStatus(status, action);
    const matched = matchDiagnostic({
      cleanDiagnostic: parsedDiag.cleanDiagnostic,
      remoteMta,
      reportingMta,
    });
    const useOverride = isGenericStatus(status) && matched.override;

    recipients.push({
      recipient,
      originalRecipient,
      action: String(action).trim().toLowerCase(),
      status,
      class: explained.class,
      retry: explained.retry,
      title: useOverride ? matched.override.title : explained.title,
      detail: useOverride ? matched.override.detail : explained.detail,
      category: useOverride ? matched.override.category : explained.category,
      remediation: useOverride ? matched.override.remediation : explained.remediation,
      reasonCode: matched.reasonCode,
      ispHint: matched.ispHint,
      diagnostic,
      diagnosticType: parsedDiag.diagnosticType,
      smtpCode: parsedDiag.smtpCode,
      cleanDiagnostic: parsedDiag.cleanDiagnostic,
      remoteMta,
      lastAttemptDate: fields.get('last-attempt-date') || null,
      willRetryUntil: fields.get('will-retry-until') || null,
    });
  });

  if (recipients.length === 0) {
    throw new BounceReadError(
      'NOT_A_BOUNCE',
      'That text is not a delivery status notification. Paste the raw bounce, including the delivery-status part.'
    );
  }

  return {
    reportingMta,
    receivedFromMta,
    arrivalDate,
    originalEnvelopeId,
    recipients,
  };
};

module.exports = {
  parseDeliveryStatus,
  extractOriginalMessageHeaders,
  BounceReadError,
  unfold,
};
