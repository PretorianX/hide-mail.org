const adminSession = require('../services/adminSession');
const adminLicenseService = require('../services/adminLicenseService');
const logger = require('../utils/logger');
const { sanitizeForLog } = require('../utils/sanitize');

const login = async (req, res) => {
  if (!adminSession.isConfigured()) {
    return res.status(503).json({
      success: false,
      error: 'Admin portal is not configured',
      code: 'ADMIN_NOT_CONFIGURED',
    });
  }

  const email = typeof req.body?.email === 'string' ? req.body.email : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!adminSession.credentialsMatch(email, password)) {
    return res.status(401).json({
      success: false,
      error: 'Invalid email or password',
      code: 'ADMIN_LOGIN_FAILED',
    });
  }

  const token = adminSession.createSessionToken(email);
  adminSession.setSessionCookie(res, token);
  return res.status(200).json({
    success: true,
    email: email.trim().toLowerCase(),
  });
};

const logout = async (_req, res) => {
  adminSession.clearSessionCookie(res);
  return res.status(200).json({ success: true });
};

const me = async (req, res) => {
  return res.status(200).json({
    success: true,
    email: req.adminSession.sub,
  });
};

const listLicenses = async (_req, res, next) => {
  try {
    const licenses = await adminLicenseService.listLicenses();
    return res.status(200).json({ success: true, licenses });
  } catch (error) {
    logger.error('admin listLicenses failed');
    return next(error);
  }
};

const createLicense = async (req, res, next) => {
  try {
    const created = await adminLicenseService.createLicense({
      type: req.body?.type,
      days: Number(req.body?.days),
      label: req.body?.label,
      plan: req.body?.plan,
      ratePerMinute: req.body?.ratePerMinute,
      dailyLimitDefault: req.body?.dailyLimitDefault,
      issueSendKey: req.body?.issueSendKey,
    });
    return res.status(201).json({
      success: true,
      license: created,
      notice: 'Copy the key now — list responses never include the plaintext secret.',
    });
  } catch (error) {
    if (error.code) {
      return res.status(400).json({
        success: false,
        error: error.message,
        code: error.code,
      });
    }
    logger.error(`admin createLicense failed code=${sanitizeForLog(error.code || 'UNKNOWN')}`);
    return next(error);
  }
};

const deleteLicense = async (req, res, next) => {
  try {
    const deleted = await adminLicenseService.deleteLicense(req.params.id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'License not found',
        code: 'NOT_FOUND',
      });
    }
    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error('admin deleteLicense failed');
    return next(error);
  }
};

const listTypes = async (_req, res) => {
  return res.status(200).json({
    success: true,
    types: adminLicenseService.LICENSE_TYPES,
  });
};

module.exports = {
  login,
  logout,
  me,
  listLicenses,
  createLicense,
  deleteLicense,
  listTypes,
};
