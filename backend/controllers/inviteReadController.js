/**
 * Invite Read HTTP handlers. The browser report and the paid API share one reader.
 */

const inviteReadService = require('../services/inviteReadService');
const config = require('../config/config');
const logger = require('../utils/logger');
const { sanitizeForLog } = require('../utils/sanitize');

const readResponse = (source, res, next) => {
  try {
    const report = inviteReadService.readInvite(source);
    return res.status(200).json({ success: true, report });
  } catch (error) {
    if (error instanceof inviteReadService.InviteReadError) {
      const status = error.code === 'INVITE_TOO_LARGE' ? 413 : 400;
      return res.status(status).json({
        success: false,
        error: error.message,
        code: error.code,
      });
    }
    logger.error(`Invite Read error: ${sanitizeForLog(error.message)}`);
    return next(error);
  }
};

const report = (req, res, next) =>
  readResponse(req.body?.source ?? req.body?.raw, res, next);

const offer = (req, res) => res.status(200).json({
  success: true,
  offer: {
    name: 'Invite Read API',
    type: 'invite',
    plan: 'monthly',
    usd: config.billing.inviteUsd,
    checkoutPaused: config.billing.checkoutPaused,
    endpoint: 'POST /api/invite-read',
  },
});

module.exports = {
  report,
  offer,
};
