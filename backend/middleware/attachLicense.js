const licenseService = require('../services/licenseService');
const entitlementService = require('../services/entitlementService');

const extractKey = (req) => {
  const header = req.get('X-License-Key');
  if (header) {
    return header.trim();
  }
  const auth = req.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  return '';
};

const attachLicense = async (req, res, next) => {
  try {
    const key = extractKey(req);
    const license = key ? await licenseService.getLicense(key) : null;
    req.license = licenseService.isActive(license) ? license : null;
    req.entitlements = entitlementService.getEntitlements(req.license);
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = attachLicense;
