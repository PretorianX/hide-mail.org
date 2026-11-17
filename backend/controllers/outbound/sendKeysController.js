/**
 * Send-key HTTP handlers. Thin controller: all logic lives in
 * services/outbound/sendKeyService.js; this just maps requests/errors.
 *
 * Licence-key-authed (`requireOutboundLicense`, wired in routes/outbound/sendKeys.js)
 * — issuing/listing/revoking a send key is a management operation, same as
 * domains, not something the send key itself can do to its own siblings.
 */

const sendKeyService = require('../../services/outbound/sendKeyService');
const logger = require('../../utils/logger');

const SENDKEY_ERROR_STATUS = {
  NAME_TAKEN: 409,
  INVALID_NAME: 400,
};

const handleSendKeyError = (error, res, next) => {
  if (error instanceof sendKeyService.SendKeyError) {
    const status = SENDKEY_ERROR_STATUS[error.code] || 400;
    return res.status(status).json({ success: false, error: error.message, code: error.code });
  }
  logger.error('Outbound send-keys error', error);
  return next(error);
};

const createSendKey = async (req, res, next) => {
  try {
    const name = req.body?.name;
    if (name === undefined || name === null || name === '') {
      return res.status(400).json({
        success: false,
        error: 'name is required',
        code: 'NAME_REQUIRED',
      });
    }

    const result = await sendKeyService.createSendKey({ accountId: req.accountId, name });
    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    return handleSendKeyError(error, res, next);
  }
};

const listSendKeys = async (req, res, next) => {
  try {
    const sendKeys = await sendKeyService.listSendKeys({ accountId: req.accountId });
    return res.status(200).json({ success: true, sendKeys });
  } catch (error) {
    logger.error('Outbound send-keys error', error);
    return next(error);
  }
};

const revokeSendKey = async (req, res, next) => {
  try {
    const revoked = await sendKeyService.revokeSendKey({ accountId: req.accountId, name: req.params.name });
    if (!revoked) {
      return res.status(404).json({
        success: false,
        error: `Send key ${req.params.name} not found`,
        code: 'NOT_FOUND',
      });
    }
    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Outbound send-keys error', error);
    return next(error);
  }
};

module.exports = {
  createSendKey,
  listSendKeys,
  revokeSendKey,
};
