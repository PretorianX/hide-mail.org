const { simpleParser } = require('mailparser');
const { v4: uuidv4 } = require('uuid');
const redisService = require('./redisService');
const qaWebhookService = require('./qaWebhookService');
const { resolveActiveRecipient } = require('./recipientResolver');
const metrics = require('./metricsService');
const config = require('../config/config');
const logger = require('../utils/logger');
const { sanitizeEmail } = require('../utils/sanitize');
const { isOutboundBounceRecipient } = require('./outbound/bounceEnvelope');
const bounceMailbackService = require('./outbound/bounceMailbackService');

const serializeAttachments = (
  attachments = [],
  maxTotalBytes = config.smtpInbound.maxAttachmentBytes
) => {
  const result = [];
  let totalBytes = 0;

  for (const att of attachments) {
    const size = att.size || (att.content ? att.content.length : 0);
    if (totalBytes + size > maxTotalBytes) {
      logger.warn(
        `Inbound: Dropping attachment "${att.filename || 'attachment'}" (${size} bytes) — aggregate attachment cap (${maxTotalBytes} bytes) exceeded`
      );
      continue;
    }
    totalBytes += size;
    result.push({
      filename: att.filename || 'attachment',
      contentType: att.contentType || 'application/octet-stream',
      contentDisposition: att.contentDisposition || 'attachment',
      cid: att.cid || null,
      size,
      content: att.content ? att.content.toString('base64') : null,
      encoding: 'base64',
    });
  }

  return result;
};

const buildStoredEmail = ({ parsedMail, rawBody, deliveredTo, siteLabel }) => {
  const attachments = serializeAttachments(parsedMail.attachments);
  const rawBytes = typeof rawBody === 'string' ? Buffer.byteLength(rawBody, 'utf8') : 0;
  const keepRawBody = attachments.length === 0 || rawBytes <= config.smtpInbound.maxStoredRawBodyBytes;

  return {
    id: uuidv4(),
    from: parsedMail.from?.text || 'unknown',
    subject: parsedMail.subject || '(No Subject)',
    preview: parsedMail.text ? parsedMail.text.substring(0, 100) : '(No content)',
    text: parsedMail.text || '',
    html: parsedMail.html || '',
    ...(keepRawBody ? { body: rawBody } : {}),
    attachments,
    deliveredTo,
    siteLabel,
    receivedAt: new Date().toISOString(),
    date: parsedMail.date ? new Date(parsedMail.date).toISOString() : new Date().toISOString(),
    read: false,
  };
};

/**
 * Route one received message into the mailbox that owns the recipient address and store it.
 *
 * The recipient may be the mailbox itself or one of its site addresses
 * (`mailbox.label@domain`); either way the message lands in the one inbox, tagged with the
 * address it arrived on.
 *
 * @param {Object} options
 * @param {string} options.recipient - Envelope recipient
 * @param {string} options.rawBody - Raw RFC822 message
 * @returns {Promise<{delivered: boolean, mailbox?: string, email?: Object, reason?: string}>}
 */
const deliverInboundMessage = async ({ recipient, rawBody }) => {
  if (isOutboundBounceRecipient(recipient)) {
    const mailback = await bounceMailbackService.processBounceMailback({ recipient, rawBody });
    logger.info(
      `Inbound: Outbound bounce mail-back for ${sanitizeEmail(recipient)}` +
        ` handled=${mailback.handled} reason=${mailback.reason || mailback.eventType || 'ok'}`
    );
    return { delivered: false, reason: 'outbound_bounce_mailback', mailback };
  }

  const route = await resolveActiveRecipient(recipient);

  if (!route) {
    // The recipient was already accepted at RCPT TO to avoid 550s, so this is a silent drop.
    const reason = config.smtpUnknownMailboxCode === 250 ? 'catch-all mode' : 'expired mailbox';
    logger.info(`Inbound: Silently dropping email for ${reason}: ${sanitizeEmail(recipient)}`);
    metrics.emailsDroppedTotal.inc({ reason });
    return { delivered: false, reason };
  }

  const parsedMail = await simpleParser(rawBody);
  const email = buildStoredEmail({
    parsedMail,
    rawBody,
    deliveredTo: String(recipient).trim().toLowerCase(),
    siteLabel: route.label,
  });

  await redisService.storeEmail(route.mailbox, email);
  metrics.emailsStoredTotal.inc();

  if (route.label) {
    metrics.emailsSiteAddressedTotal.inc();
  }

  // Fire-and-forget so a slow or stalling QA webhook never blocks inbound SMTP completion.
  Promise.resolve(qaWebhookService.notifyMailboxWebhook(route.mailbox, email)).catch((err) => {
    logger.warn(`Inbound: QA webhook dispatch error for ${sanitizeEmail(route.mailbox)}: ${err.message}`);
  });

  logger.info(
    `Inbound: Stored message ${email.id} for ${sanitizeEmail(route.mailbox)}` +
      (route.label ? ` via site address "${route.label}"` : '')
  );

  return { delivered: true, mailbox: route.mailbox, email };
};

module.exports = {
  deliverInboundMessage,
};
