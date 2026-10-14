/**
 * Sender Check HTTP handlers. The browser report and the paid API share one checker.
 */

const senderCheckService = require('../services/senderCheckService');
const config = require('../config/config');
const logger = require('../utils/logger');
const { sanitizeForLog } = require('../utils/sanitize');

const checkResponse = async (domain, res, next) => {
  try {
    const report = await senderCheckService.checkDomain(domain);
    return res.status(200).json({ success: true, report });
  } catch (error) {
    if (error instanceof senderCheckService.SenderCheckError) {
      const status = error.code === 'DNS_UNAVAILABLE' ? 503 : 400;
      return res.status(status).json({
        success: false,
        error: error.message,
        code: error.code,
      });
    }
    logger.error(`Sender Check error: ${sanitizeForLog(error.message)}`);
    return next(error);
  }
};

const report = (req, res, next) => checkResponse(req.body?.domain, res, next);

const offer = (req, res) => res.status(200).json({
  success: true,
  offer: {
    name: 'Sender Check API',
    type: 'sender',
    plan: 'monthly',
    usd: config.billing.senderUsd,
    checkoutPaused: config.billing.checkoutPaused,
    endpoint: 'POST /api/sender-check',
  },
});

module.exports = {
  report,
  offer,
};
