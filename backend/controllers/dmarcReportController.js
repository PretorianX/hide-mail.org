/**
 * DMARC Reports HTTP handlers. The browser summary and the paid API share one reader.
 */

const dmarcReportService = require('../services/dmarcReportService');
const config = require('../config/config');
const logger = require('../utils/logger');
const { sanitizeForLog } = require('../utils/sanitize');

const STATUS = {
  REPORT_REQUIRED: 400,
  REPORT_NOT_FEEDBACK: 400,
  REPORT_UNREADABLE: 400,
  REPORT_TOO_LARGE: 413,
};

const readResponse = async (xml, res, next) => {
  try {
    const report = await dmarcReportService.readReport(xml);
    return res.status(200).json({ success: true, report });
  } catch (error) {
    if (error instanceof dmarcReportService.DmarcReportError) {
      return res.status(STATUS[error.code] || 400).json({
        success: false,
        error: error.message,
        code: error.code,
      });
    }
    logger.error(`DMARC Reports error: ${sanitizeForLog(error.message)}`);
    return next(error);
  }
};

const read = (req, res, next) => readResponse(req.body?.xml, res, next);

const offer = (req, res) => res.status(200).json({
  success: true,
  offer: {
    name: 'DMARC Reports API',
    type: 'reports',
    plan: 'monthly',
    usd: config.billing.reportsUsd,
    checkoutPaused: config.billing.checkoutPaused,
    endpoint: 'POST /api/dmarc-reports',
  },
});

module.exports = {
  read,
  offer,
};
