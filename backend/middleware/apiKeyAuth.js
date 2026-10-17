const licenseService = require('../services/licenseService');
const logger = require('../utils/logger');

const extractApiKey = (req) => {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }
  return req.headers['x-api-key'] || null;
};

const requireApiKey = async (req, res, next) => {
  try {
    const apiKey = extractApiKey(req);
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'API key required',
        code: 'API_KEY_REQUIRED',
      });
    }

    const resolved = await licenseService.validateApiKey(apiKey);
    if (!resolved) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired API key',
        code: 'API_KEY_INVALID',
      });
    }

    req.apiKey = apiKey;
    req.apiLicense = resolved.license;
    return next();
  } catch (error) {
    logger.error('requireApiKey error', error);
    return next(error);
  }
};

const LICENSE_TYPE_DENIAL = {
  api: {
    error: 'This key is not a QA API key',
    code: 'QA_PLAN_REQUIRED',
  },
  grade: {
    error: 'This key is not a Mail Grade API key',
    code: 'GRADE_PLAN_REQUIRED',
  },
  bounce: {
    error: 'This key is not a Bounce Read API key',
    code: 'BOUNCE_PLAN_REQUIRED',
  },
};

const requireLicenseType = (type) => (req, res, next) => {
  if (req.apiLicense?.type === type) {
    return next();
  }
  const denial = LICENSE_TYPE_DENIAL[type];
  if (!denial) {
    throw new Error(`Unsupported license type: ${type}`);
  }
  return res.status(403).json({
    success: false,
    error: denial.error,
    code: denial.code,
  });
};

module.exports = {
  requireApiKey,
  extractApiKey,
  requireLicenseType,
};
