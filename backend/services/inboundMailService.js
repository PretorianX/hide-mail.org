const { simpleParser } = require('mailparser');
const { v4: uuidv4 } = require('uuid');
const redisService = require('./redisService');
const qaWebhookService = require('./qaWebhookService');
const { resolveActiveRecipient } = require('./recipientResolver');
const metrics = require('./metricsService');
const config = require('../config/config');
const logger = require('../utils/logger');
const { sanitizeEmail } = require('../utils/sanitize');

const serializeAttachments = (attachments = []) =>
  attachments.map((att) => ({
    filename: att.filename || 'attachment',
    contentType: att.contentType || 'application/octet-stream',
    contentDisposition: att.contentDisposition || 'attachment',
    cid: att.cid || null,
    size: att.size || 0,
    content: att.content ? att.content.toString('base64') : null,
    encoding: 'base64',
  }));

const buildStoredEmail = ({ parsedMail, rawBody, deliveredTo, siteLabel }) => ({
  id: uuidv4(),
  from: parsedMail.from?.text || 'unknown',
  subject: parsedMail.subject || '(No Subject)',
  preview: parsedMail.text ? parsedMail.text.substring(0, 100) : '(No content)',
  text: parsedMail.text || '',
  html: parsedMail.html || '',
  body: rawBody,
  attachments: serializeAttachments(parsedMail.attachments),
  deliveredTo,
  siteLabel,
  receivedAt: new Date().toISOString(),
  date: parsedMail.date ? new Date(parsedMail.date).toISOString() : new Date().toISOString(),
  read: false,
});

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

  await qaWebhookService.notifyMailboxWebhook(route.mailbox, email);

  logger.info(
    `Inbound: Stored message ${email.id} for ${sanitizeEmail(route.mailbox)}` +
      (route.label ? ` via site address "${route.label}"` : '')
  );

  return { delivered: true, mailbox: route.mailbox, email };
};

module.exports = {
  deliverInboundMessage,
};
