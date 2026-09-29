/**
 * Mail Grade HTTP handlers. The browser report and the paid API share one grader.
 */

const mailGradeService = require('../services/mailGradeService');
const config = require('../config/config');
const logger = require('../utils/logger');
const { sanitizeForLog } = require('../utils/sanitize');

const gradeResponse = async (source, res, next) => {
  try {
    const report = await mailGradeService.gradeEmail(source);
    return res.status(200).json({ success: true, report });
  } catch (error) {
    if (error instanceof mailGradeService.MailGradeError) {
      const status = error.code === 'EMAIL_TOO_LARGE' ? 413 : 400;
      return res.status(status).json({
        success: false,
        error: error.message,
        code: error.code,
      });
    }
    logger.error(`Mail Grade error: ${sanitizeForLog(error.message)}`);
    return next(error);
  }
};

const report = (req, res, next) => gradeResponse(req.body?.source, res, next);

const offer = (req, res) => res.status(200).json({
  success: true,
  offer: {
    name: 'Mail Grade API',
    type: 'grade',
    plan: 'monthly',
    usd: config.billing.gradeUsd,
    checkoutPaused: config.billing.checkoutPaused,
    endpoint: 'POST /api/mail-grade',
  },
});

module.exports = {
  report,
  offer,
};
