/**
 * Access Check HTTP handlers. The browser report and the paid API share one reader.
 */

const accessCheckService = require('../services/accessCheckService');
const config = require('../config/config');
const logger = require('../utils/logger');
const { sanitizeForLog } = require('../utils/sanitize');

const readResponse = (source, res, next) => {
  try {
    const report = accessCheckService.readAccess(source);
    return res.status(200).json({ success: true, report });
  } catch (error) {
    if (error instanceof accessCheckService.AccessCheckError) {
      const status = error.code === 'ACCESS_TOO_LARGE' ? 413 : 400;
      return res.status(status).json({
        success: false,
        error: error.message,
        code: error.code,
      });
    }
    logger.error(`Access Check error: ${sanitizeForLog(error.message)}`);
    return next(error);
  }
};

const report = (req, res, next) =>
  readResponse(req.body?.source ?? req.body?.raw, res, next);

const offer = (req, res) => res.status(200).json({
  success: true,
  offer: {
    name: 'Access Check API',
    type: 'access',
    plan: 'monthly',
    usd: config.billing.accessUsd,
    checkoutPaused: config.billing.checkoutPaused,
    endpoint: 'POST /api/access-read',
  },
});

module.exports = {
  report,
  offer,
};
