/**
 * Replying from a temporary address.
 *
 *   GET  /api/reply/status/:email         allowance and whether replying is possible
 *   GET  /api/reply/:email/:messageId     replies already sent for a message
 *   POST /api/reply/:email/:messageId     send a reply   { body: "..." }
 *
 * The POST body carries the text and nothing else. A recipient supplied by the caller is
 * ignored on purpose: it is always derived from the stored message.
 */

const replyService = require('../services/replyService');
const logger = require('../utils/logger');

const STATUS_BY_CODE = {
  MAILBOX_NOT_ACTIVE: 404,
  MESSAGE_NOT_FOUND: 404,
  REPLY_LIMIT_REACHED: 429,
  EMPTY_BODY: 400,
  BODY_TOO_LONG: 400,
  NO_REPLY_RECIPIENT: 400,
  RECIPIENT_NOT_ALLOWED: 400,
  RECIPIENT_REJECTED: 400,
  SMTP_NOT_CONFIGURED: 503,
  SMTP_CONNECTION_FAILED: 503,
  SMTP_AUTH_FAILED: 503,
  SMTP_TEMPORARY_FAILURE: 503,
  SMTP_SEND_FAILED: 503,
};

const invalidAddress = (email) => !email || !email.includes('@');

const badAddress = (res) => res.status(400).json({
  success: false,
  error: 'Invalid email address',
  code: 'INVALID_ADDRESS',
});

const getStatus = async (req, res, next) => {
  try {
    const { email } = req.params;
    if (invalidAddress(email)) {
      return badAddress(res);
    }

    return res.status(200).json({
      success: true,
      data: await replyService.getStatus(email),
    });
  } catch (error) {
    logger.error('Reply Controller: getStatus error', error);
    return next(error);
  }
};

const listReplies = async (req, res, next) => {
  try {
    const { email, messageId } = req.params;
    if (invalidAddress(email)) {
      return badAddress(res);
    }

    return res.status(200).json({
      success: true,
      data: await replyService.listReplies(email, messageId),
    });
  } catch (error) {
    logger.error('Reply Controller: listReplies error', error);
    return next(error);
  }
};

const sendReply = async (req, res, next) => {
  try {
    const { email, messageId } = req.params;
    if (invalidAddress(email)) {
      return badAddress(res);
    }

    const result = await replyService.sendReply(email, messageId, req.body?.body);

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    const status = STATUS_BY_CODE[error.code];
    if (!status) {
      logger.error('Reply Controller: sendReply error', error);
      return next(error);
    }

    const payload = { success: false, error: error.message, code: error.code };
    if (error.code === 'REPLY_LIMIT_REACHED') {
      payload.upgradeUrl = '/pro';
    }
    return res.status(status).json(payload);
  }
};

module.exports = {
  getStatus,
  listReplies,
  sendReply,
};
