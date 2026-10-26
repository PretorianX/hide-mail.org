/**
 * Complaint Read HTTP handlers. The browser report and the paid API share one reader.
 */

const complaintReadService = require('../services/complaintReadService');
const config = require('../config/config');
const logger = require('../utils/logger');
const { sanitizeForLog } = require('../utils/sanitize');

const readResponse = (source, res, next) => {
  try {
    const report = complaintReadService.readComplaint(source);
    return res.status(200).json({ success: true, report });
  } catch (error) {
    if (error instanceof complaintReadService.ComplaintReadError) {
      const status = error.code === 'COMPLAINT_TOO_LARGE' ? 413 : 400;
      return res.status(status).json({
        success: false,
        error: error.message,
        code: error.code,
      });
    }
    logger.error(`Complaint Read error: ${sanitizeForLog(error.message)}`);
    return next(error);
  }
};

const report = (req, res, next) => readResponse(req.body?.source, res, next);

const offer = (req, res) => res.status(200).json({
  success: true,
  offer: {
    name: 'Complaint Read API',
    type: 'complaint',
    plan: 'monthly',
    usd: config.billing.complaintUsd,
    checkoutPaused: config.billing.checkoutPaused,
    endpoint: 'POST /api/complaint-read',
  },
});

module.exports = {
  report,
  offer,
};
