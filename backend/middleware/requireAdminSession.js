const adminSession = require('../services/adminSession');

const requireAdminSession = (req, res, next) => {
  if (!adminSession.isConfigured()) {
    return res.status(503).json({
      success: false,
      error: 'Admin portal is not configured',
      code: 'ADMIN_NOT_CONFIGURED',
    });
  }
  const session = adminSession.readSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({
      success: false,
      error: 'Admin authentication required',
      code: 'ADMIN_AUTH_REQUIRED',
    });
  }
  req.adminSession = session;
  return next();
};

module.exports = requireAdminSession;
