/**
 * Send-API message handlers. Authenticated via requireSendKey (Bearer hm_send_...).
 */

const sendService = require('../../services/outbound/sendService');
const logger = require('../../utils/logger');

const getClientIp = (req) => {
  return req.ip || req.socket?.remoteAddress || null;
};

const SEND_ERROR_STATUS = {
  RATE_LIMITED: 429,
  DOMAIN_NOT_VERIFIED: 403,
  DOMAIN_SUSPENDED: 403,
  INVALID_RECIPIENT: 422,
  RECIPIENT_SUPPRESSED: 422,
  DAILY_LIMIT_REACHED: 429,
  MESSAGE_TOO_LARGE: 413,
  RELAY_UNAVAILABLE: 503,
  ZONEMTA_UNAVAILABLE: 503, // legacy alias
};

const handleSendError = (error, res, next) => {
  if (error instanceof sendService.SendError) {
    const status = SEND_ERROR_STATUS[error.code] || 400;
    const body = { success: false, error: error.message, code: error.code };
    if (error.retryAfterSeconds !== undefined) {
      body.retryAfterSeconds = error.retryAfterSeconds;
      res.set('Retry-After', String(error.retryAfterSeconds));
    }
    if (error.resetAt !== undefined) {
      body.resetAt = error.resetAt;
    }
    return res.status(status).json(body);
  }
  logger.error('Outbound messages error', error);
  return next(error);
};

const createMessage = async (req, res, next) => {
  try {
    const result = await sendService.sendMessage({
      accountId: req.accountId,
      from: req.body?.from,
      to: req.body?.to,
      subject: req.body?.subject,
      text: req.body?.text,
      html: req.body?.html,
      replyTo: req.body?.replyTo,
      attachments: req.body?.attachments,
      reference: req.body?.reference,
      idempotencyKey: req.get('Idempotency-Key') || null,
      clientIp: getClientIp(req),
      sendKeyName: req.sendKeyName || null,
    });
    return res.status(202).json({ success: true, ...result });
  } catch (error) {
    return handleSendError(error, res, next);
  }
};

const getMessage = async (req, res, next) => {
  try {
    const message = await sendService.getMessageForAccount({
      accountId: req.accountId,
      id: req.params.id,
    });
    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found',
        code: 'NOT_FOUND',
      });
    }
    return res.status(200).json({ success: true, message });
  } catch (error) {
    logger.error('Outbound messages error', error);
    return next(error);
  }
};

module.exports = {
  createMessage,
  getMessage,
};
