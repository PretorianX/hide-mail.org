/**
 * Bounce Read HTTP handlers. The browser report and the paid API share one reader.
 */

const bounceReadService = require('../services/bounceReadService');
const config = require('../config/config');
const logger = require('../utils/logger');
const { sanitizeForLog } = require('../utils/sanitize');

const readResponse = async (source, res, next) => {
  try {
    const report = await bounceReadService.readBounce(source);
    return res.status(200).json({ success: true, report });
  } catch (error) {
    if (error instanceof bounceReadService.BounceReadError) {
      const status = error.code === 'BOUNCE_TOO_LARGE' ? 413 : 400;
      return res.status(status).json({
        success: false,
        error: error.message,
        code: error.code,
      });
    }
    logger.error(`Bounce Read error: ${sanitizeForLog(error.message)}`);
    return next(error);
  }
};

const report = (req, res, next) => readResponse(req.body?.source, res, next);

const offer = (req, res) => res.status(200).json({
  success: true,
  offer: {
    name: 'Bounce Read API',
    type: 'bounce',
    plan: 'monthly',
    usd: config.billing.bounceUsd,
    checkoutPaused: config.billing.checkoutPaused,
    endpoint: 'POST /api/bounce-read',
  },
});

module.exports = {
  report,
  offer,
};
