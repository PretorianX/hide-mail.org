/**
 * Replying from a temporary address.
 *
 * Orchestration only — the rules live in replyPolicy, the state lives in replyStore. The order
 * of operations matters: the allowance is spent only after the transport accepted the reply, so
 * a bounced or refused send never costs the user one of their replies.
 */

const config = require('../config/config');
const logger = require('../utils/logger');
const { sanitizeEmail, sanitizeMessageId } = require('../utils/sanitize');
const { classifySmtpError } = require('../utils/smtpErrors');
const redisService = require('./redisService');
const licenseService = require('./licenseService');
const entitlementService = require('./entitlementService');
const smtpService = require('./smtpService');
const metrics = require('./metricsService');
const replyPolicy = require('./replyPolicy');
const replyStore = require('./replyStore');

const codedError = (code, message) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

const smtpErrorMessage = (code) => {
  switch (code) {
    case 'SMTP_NOT_CONFIGURED':
      return 'Replying is temporarily unavailable. Please try again later.';
    case 'SMTP_CONNECTION_FAILED':
      return 'Unable to reach the mail server. Please try again in a few moments.';
    case 'SMTP_AUTH_FAILED':
      return 'Mail server authentication error. Please contact support.';
    case 'RECIPIENT_REJECTED':
      return 'The recipient rejected your reply.';
    case 'SMTP_TEMPORARY_FAILURE':
      return 'The mail server is busy. Please try again in a few moments.';
    default:
      return 'Failed to send your reply. Please try again.';
  }
};

/** The entitlements of whichever license, if any, the mailbox was registered with. */
const entitlementsFor = async (mailbox) => {
  const meta = await redisService.getMailboxMeta(mailbox);
  const license = meta?.licenseKey ? await licenseService.getLicense(meta.licenseKey) : null;
  return entitlementService.getEntitlements(license);
};

const getStatus = async (mailbox) => {
  const smtpConfigured = smtpService.isConfigured();

  if (!(await redisService.isMailboxActive(mailbox))) {
    return {
      active: false,
      canReply: false,
      smtpConfigured,
      maxBodyChars: config.reply.maxBodyChars,
    };
  }

  const entitlements = await entitlementsFor(mailbox);
  const quota = await replyStore.getQuota(mailbox, entitlements.replyLimit);

  return {
    active: true,
    planType: entitlements.planType,
    proReplyLimit: config.reply.proLimit,
    maxBodyChars: config.reply.maxBodyChars,
    smtpConfigured,
    ...quota,
    canReply: quota.canReply && smtpConfigured,
  };
};

const sendReply = async (mailbox, messageId, body) => {
  if (!(await redisService.isMailboxActive(mailbox))) {
    throw codedError('MAILBOX_NOT_ACTIVE', 'This address has expired.');
  }

  if (!smtpService.isConfigured()) {
    throw codedError('SMTP_NOT_CONFIGURED', smtpErrorMessage('SMTP_NOT_CONFIGURED'));
  }

  const message = await redisService.getEmailById(mailbox, messageId);
  if (!message) {
    throw codedError('MESSAGE_NOT_FOUND', 'Message not found.');
  }

  // Built before the quota check so a malformed reply is reported as malformed rather than
  // eating the user's last allowance slot on validation.
  const reply = replyPolicy.buildReply({
    mailbox,
    message,
    body,
    maxBodyChars: config.reply.maxBodyChars,
    serviceDomains: config.validDomains,
  });

  const entitlements = await entitlementsFor(mailbox);
  const quota = await replyStore.getQuota(mailbox, entitlements.replyLimit);
  if (!quota.canReply) {
    metrics.repliesTotal.inc({ result: 'quota' });
    throw codedError(
      'REPLY_LIMIT_REACHED',
      `This address has used all ${quota.limit} of its replies.`
    );
  }

  try {
    await smtpService.sendReply(reply);
  } catch (error) {
    const code = classifySmtpError(error);
    metrics.repliesTotal.inc({ result: 'failed' });
    logger.error(`Reply Service: Failed to send reply from ${sanitizeEmail(mailbox)}`, error);
    throw codedError(code, smtpErrorMessage(code));
  }

  const sentAt = new Date().toISOString();
  const used = await replyStore.consumeQuota(mailbox);
  await replyStore.recordReply(mailbox, messageId, {
    to: reply.to,
    subject: reply.subject,
    body: body.trim(),
    sentAt,
  });

  metrics.repliesTotal.inc({ result: 'sent' });
  logger.info(
    `Reply Service: ${sanitizeEmail(mailbox)} replied to ${sanitizeEmail(reply.to)} `
    + `on message ${sanitizeMessageId(messageId)}`
  );

  return {
    to: reply.to,
    subject: reply.subject,
    sentAt,
    used,
    remaining: Math.max(0, quota.limit - used),
  };
};

const listReplies = (mailbox, messageId) => replyStore.listReplies(mailbox, messageId);

module.exports = {
  getStatus,
  sendReply,
  listReplies,
};
