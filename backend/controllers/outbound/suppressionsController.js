/**
 * Suppression list management. Licence-key authed.
 */

const suppressionService = require('../../services/outbound/suppressionService');
const logger = require('../../utils/logger');

const listSuppressions = async (req, res, next) => {
  try {
    const suppressions = await suppressionService.listSuppressions({ accountId: req.accountId });
    return res.status(200).json({ success: true, suppressions });
  } catch (error) {
    logger.error('Outbound suppressions error', error);
    return next(error);
  }
};

const addSuppression = async (req, res, next) => {
  try {
    const email = req.body?.email;
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'email is required',
        code: 'EMAIL_REQUIRED',
      });
    }
    await suppressionService.addSuppression({
      accountId: req.accountId,
      email,
      reason: req.body?.reason || 'manual',
    });
    return res.status(201).json({ success: true });
  } catch (error) {
    logger.error('Outbound suppressions error', error);
    return next(error);
  }
};

const removeSuppression = async (req, res, next) => {
  try {
    const removed = await suppressionService.removeSuppression({
      accountId: req.accountId,
      email: req.params.email,
    });
    if (!removed) {
      return res.status(404).json({
        success: false,
        error: 'Suppression entry not found',
        code: 'NOT_FOUND',
      });
    }
    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Outbound suppressions error', error);
    return next(error);
  }
};

const exportSuppressions = async (req, res, next) => {
  try {
    const csv = await suppressionService.exportSuppressionsCsv({ accountId: req.accountId });
    res.set('Content-Type', 'text/csv; charset=utf-8');
    return res.status(200).send(csv);
  } catch (error) {
    logger.error('Outbound suppressions error', error);
    return next(error);
  }
};

module.exports = {
  listSuppressions,
  addSuppression,
  removeSuppression,
  exportSuppressions,
};
