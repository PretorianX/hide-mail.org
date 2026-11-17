/**
 * Metrics-token management. Licence-key authed (requireOutboundLicense).
 */

const metricsTokenService = require('../../services/outbound/metricsTokenService');
const logger = require('../../utils/logger');

const rotateToken = async (req, res, next) => {
  try {
    const result = await metricsTokenService.rotateMetricsToken({ accountId: req.accountId });
    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    logger.error('Outbound metrics-token rotate error', error);
    return next(error);
  }
};

const getTokenMeta = async (req, res, next) => {
  try {
    const meta = await metricsTokenService.getMetricsTokenMeta({ accountId: req.accountId });
    if (!meta) {
      return res.status(404).json({
        success: false,
        error: 'No metrics token issued yet',
        code: 'NOT_FOUND',
      });
    }
    return res.status(200).json({ success: true, ...meta });
  } catch (error) {
    logger.error('Outbound metrics-token get error', error);
    return next(error);
  }
};

module.exports = {
  rotateToken,
  getTokenMeta,
};
