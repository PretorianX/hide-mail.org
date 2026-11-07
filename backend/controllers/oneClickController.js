/**
 * One-Click HTTP handlers. The browser check and the paid API share one reader.
 */

const oneClickService = require('../services/oneClickService');
const config = require('../config/config');
const logger = require('../utils/logger');
const { sanitizeForLog } = require('../utils/sanitize');

const readResponse = (source, res, next) => {
  try {
    const report = oneClickService.readOneClick(source);
    return res.status(200).json({ success: true, report });
  } catch (error) {
    if (error instanceof oneClickService.OneClickError) {
      const status = error.code === 'ONECLICK_TOO_LARGE' ? 413 : 400;
      return res.status(status).json({
        success: false,
        error: error.message,
        code: error.code,
      });
    }
    logger.error(`One-Click error: ${sanitizeForLog(error.message)}`);
    return next(error);
  }
};

const report = (req, res, next) =>
  readResponse(req.body?.source ?? req.body?.raw, res, next);

const offer = (req, res) => res.status(200).json({
  success: true,
  offer: {
    name: 'One-Click API',
    type: 'oneclick',
    plan: 'monthly',
    usd: config.billing.oneclickUsd,
    checkoutPaused: config.billing.checkoutPaused,
    endpoint: 'POST /api/one-click-read',
  },
});

module.exports = {
  report,
  offer,
};
