/**
 * Late DSN mail-back: parse Bounce Read report for VERP recipients and XADD
 * into outbound:events for the existing consumer / suppression / metrics path.
 */

const redisService = require('../redisService');
const bounceReadService = require('../bounceReadService');
const messageStore = require('./messageStore');
const {
  parseOutboundBounceRecipient,
  verifyVerpMac,
  isLegacyVerpAllowed,
} = require('./bounceEnvelope');

const STREAM = 'outbound:events';

const pickPrimaryRecipient = (recipients) => {
  if (!Array.isArray(recipients) || recipients.length === 0) {
    return null;
  }
  return (
    recipients.find((r) => r.class === 'hard') ||
    recipients.find((r) => r.class === 'soft' || r.class === 'delayed') ||
    recipients[0]
  );
};

const eventTypeForClass = (klass) => {
  if (klass === 'hard') {
    return 'bounced';
  }
  if (klass === 'soft' || klass === 'delayed') {
    return 'deferred';
  }
  return null;
};

const buildResponse = (recipient) => {
  const parts = [
    recipient.smtpCode || '',
    recipient.status || '',
    recipient.cleanDiagnostic || recipient.title || '',
  ]
    .map((p) => String(p || '').trim())
    .filter(Boolean);
  return parts.join(' ');
};

const processBounceMailback = async ({ recipient, rawBody, redisClient } = {}) => {
  const parsed = parseOutboundBounceRecipient(recipient);
  if (!parsed) {
    return { handled: false, reason: 'not_bounce_recipient' };
  }

  const message = await messageStore.getMessage(parsed.messageId);
  if (!message || !message.domain) {
    return { handled: true, reason: 'unknown_message' };
  }

  const storedDomain = String(message.domain).trim().toLowerCase();
  if (parsed.domain && parsed.domain.toLowerCase() !== storedDomain) {
    return { handled: true, reason: 'domain_mismatch' };
  }

  if (parsed.mac) {
    if (!verifyVerpMac(parsed, message)) {
      return { handled: true, reason: 'invalid_verp_signature' };
    }
  } else if (!isLegacyVerpAllowed()) {
    return { handled: true, reason: 'invalid_verp_signature' };
  }

  let report;
  try {
    report = await bounceReadService.readBounce(rawBody);
  } catch (error) {
    if (error instanceof bounceReadService.BounceReadError) {
      return { handled: true, reason: 'not_a_dsn' };
    }
    throw error;
  }

  const primary = pickPrimaryRecipient(report.recipients);
  if (!primary) {
    return { handled: true, reason: 'empty_dsn' };
  }

  const storedRecipient = String(message.recipient || '').trim().toLowerCase();
  const dsnRecipient = String(primary.recipient || '').trim().toLowerCase();
  if (!storedRecipient || !dsnRecipient || dsnRecipient !== storedRecipient) {
    return { handled: true, reason: 'recipient_mismatch' };
  }

  const eventType = eventTypeForClass(primary.class);
  if (!eventType) {
    return { handled: true, reason: 'dsn_not_failure' };
  }

  const response = buildResponse(primary);
  const at = new Date().toISOString();
  const client = redisClient || redisService.client;

  await client.xadd(
    STREAM,
    '*',
    'type',
    eventType,
    'messageId',
    parsed.messageId,
    'domain',
    storedDomain,
    'response',
    response,
    'at',
    at
  );

  return { handled: true, eventType, messageId: parsed.messageId };
};

module.exports = {
  processBounceMailback,
  STREAM,
};
