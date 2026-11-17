/**
 * Recent outbound message activity for the portal. Licence-key authed.
 */

const messageStore = require('../../services/outbound/messageStore');
const logger = require('../../utils/logger');

const listActivity = async (req, res, next) => {
  try {
    const rawLimit = req.query?.limit;
    const limit = rawLimit === undefined ? 50 : Number(rawLimit);
    if (!Number.isFinite(limit) || limit < 1) {
      return res.status(400).json({
        success: false,
        error: 'limit must be a positive integer',
        code: 'INVALID_LIMIT',
      });
    }
    const messages = await messageStore.listRecentMessages({
      accountId: req.accountId,
      limit: Math.min(limit, 200),
    });
    return res.status(200).json({ success: true, messages });
  } catch (error) {
    logger.error('Outbound activity list error', error);
    return next(error);
  }
};

module.exports = {
  listActivity,
};
