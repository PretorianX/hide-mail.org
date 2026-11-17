/**
 * Account summary for outbound Send. Licence-key authed.
 */

const sendService = require('../../services/outbound/sendService');
const logger = require('../../utils/logger');

const getSummary = async (req, res, next) => {
  try {
    const summary = await sendService.getAccountSummary({ accountId: req.accountId });
    return res.status(200).json({ success: true, ...summary });
  } catch (error) {
    logger.error('Outbound account summary error', error);
    return next(error);
  }
};

module.exports = {
  getSummary,
};
