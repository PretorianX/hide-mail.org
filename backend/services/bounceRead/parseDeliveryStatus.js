/**
 * Parse one message/delivery-status body (RFC 3464) into per-recipient records.
 * Blocks are separated by a blank line. The first block is per-message when
 * it has no Status. A block with a Status and no recipient is rejected.
 */

const { explainStatus } = require('./statusCatalog');

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
  const fields = {};
  block.split('\n').forEach((line) => {
    const match = line.match(/^([A-Za-z][A-Za-z0-9-]*)\s*:\s*(.*)$/);
    if (!match) {
      return;
    }
    const name = match[1].toLowerCase();
    const value = match[2].trim();
    fields[name] = fields[name] ? `${fields[name]} ${value}` : value;
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
  const recipients = [];

  blocks.forEach((block) => {
    const fields = parseFields(block);
    if (fields['reporting-mta'] && !reportingMta) {
      reportingMta = fields['reporting-mta'];
    }
    const status = statusOf(fields.status);
    if (!status) {
      return;
    }
    const recipient = addressOf(fields['final-recipient'] || fields['original-recipient']);
    if (!recipient) {
      throw new BounceReadError('NOT_A_BOUNCE', 'That bounce names no recipient.');
    }
    const explained = explainStatus(status, fields.action || '');
    recipients.push({
      recipient,
      action: String(fields.action || '').trim().toLowerCase(),
      status,
      class: explained.class,
      retry: explained.retry,
      title: explained.title,
      detail: explained.detail,
      diagnostic: fields['diagnostic-code'] || '',
      remoteMta: fields['remote-mta'] || '',
    });
  });

  if (recipients.length === 0) {
    throw new BounceReadError(
      'NOT_A_BOUNCE',
      'That text is not a delivery status notification. Paste the raw bounce, including the delivery-status part.'
    );
  }

  return { reportingMta, recipients };
};

module.exports = {
  parseDeliveryStatus,
  BounceReadError,
  unfold,
};
