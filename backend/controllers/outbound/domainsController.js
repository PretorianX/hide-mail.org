/**
 * Outbound sending-domain HTTP handlers. Thin controller: all domain logic
 * lives in services/outbound/domainService.js; this just maps requests/errors.
 */

const domainService = require('../../services/outbound/domainService');
const logger = require('../../utils/logger');

const DOMAIN_ERROR_STATUS = {
  DOMAIN_TAKEN: 409,
  NOT_FOUND: 404,
};

const handleDomainError = (error, res, next) => {
  if (error instanceof domainService.DomainError) {
    const status = DOMAIN_ERROR_STATUS[error.code] || 400;
    return res.status(status).json({ success: false, error: error.message, code: error.code });
  }
  logger.error('Outbound domains error', error);
  return next(error);
};

const addDomain = async (req, res, next) => {
  try {
    const domain = req.body?.domain;
    if (!domain) {
      return res.status(400).json({
        success: false,
        error: 'domain is required',
        code: 'DOMAIN_REQUIRED',
      });
    }

    const result = await domainService.addDomain({ accountId: req.accountId, domain });
    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    return handleDomainError(error, res, next);
  }
};

const listDomains = async (req, res, next) => {
  try {
    const domains = await domainService.listDomains({ accountId: req.accountId });
    return res.status(200).json({ success: true, domains });
  } catch (error) {
    logger.error('Outbound domains error', error);
    return next(error);
  }
};

const checkDomain = async (req, res, next) => {
  try {
    const result = await domainService.checkDomain({ accountId: req.accountId, domain: req.params.domain });
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return handleDomainError(error, res, next);
  }
};

const removeDomain = async (req, res, next) => {
  try {
    const removed = await domainService.removeDomain({ accountId: req.accountId, domain: req.params.domain });
    if (!removed) {
      return res.status(404).json({
        success: false,
        error: `Domain ${req.params.domain} not found`,
        code: 'NOT_FOUND',
      });
    }
    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Outbound domains error', error);
    return next(error);
  }
};

module.exports = {
  addDomain,
  listDomains,
  checkDomain,
  removeDomain,
};
