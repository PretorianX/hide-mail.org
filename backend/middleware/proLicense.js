const licenseService = require('../services/licenseService');
const entitlementService = require('../services/entitlementService');
const logger = require('../utils/logger');

const attachLicense = async (req, res, next) => {
  try {
    const key = req.headers['x-license-key'];
    if (!key) {
      req.license = null;
      req.entitlements = entitlementService.getEntitlements(null);
      return next();
    }
    const license = await licenseService.getLicense(key);
    req.license = licenseService.isActive(license) ? license : null;
    req.entitlements = entitlementService.getEntitlements(req.license);
    return next();
  } catch (error) {
    logger.error('attachLicense error', error);
    return next(error);
  }
};

const requirePro = (req, res, next) => {
  const type = req.license?.type;
  if (!req.license || (type !== 'pro' && type !== 'api')) {
    return res.status(403).json({
      success: false,
      error: 'Hide Mail Pro license required',
      code: 'PRO_REQUIRED',
    });
  }
  return next();
};

module.exports = {
  attachLicense,
  requirePro,
};
