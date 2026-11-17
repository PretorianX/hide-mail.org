/**
 * Auth middleware for the outbound-send management API
 * (`/api/outbound/domains`, `/api/outbound/send-keys`, `/api/outbound/account`).
 *
 * `requireOutboundLicense` chains after the existing `attachLicense` middleware
 * (which resolves `X-License-Key`/`Authorization: Bearer ...` into `req.license`,
 * or `null` if missing/invalid/expired). Task 7 adds `requireSendKey` to this
 * same file for the separate `hm_send_...` send-time auth path.
 */

const extractLicenseKey = (req) => {
  const header = req.get('X-License-Key');
  if (header) {
    return header.trim();
  }
  const auth = req.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length).trim();
  }
  return '';
};

const requireOutboundLicense = (req, res, next) => {
  if (!req.license) {
    if (!extractLicenseKey(req)) {
      return res.status(401).json({
        success: false,
        error: 'License key required',
        code: 'LICENSE_KEY_REQUIRED',
      });
    }
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired license key',
      code: 'LICENSE_KEY_INVALID',
    });
  }

  if (req.license.type !== 'outbound') {
    return res.status(403).json({
      success: false,
      error: 'An outbound licence is required',
      code: 'OUTBOUND_LICENSE_REQUIRED',
    });
  }

  req.accountId = req.license.accountId;
  return next();
};

module.exports = {
  requireOutboundLicense,
};
