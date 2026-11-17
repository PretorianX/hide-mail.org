/**
 * Auth middleware for the outbound-send API.
 *
 * `requireOutboundLicense` chains after the existing `attachLicense` middleware
 * (which resolves `X-License-Key`/`Authorization: Bearer ...` into `req.license`,
 * or `null` if missing/invalid/expired). It guards the management endpoints:
 * `/api/outbound/domains`, `/api/outbound/send-keys`, `/api/outbound/account`.
 *
 * `requireSendKey` guards the Send API itself (`/api/outbound/messages`) with
 * the separate `hm_send_...` bearer credential — it never accepts
 * `X-License-Key`, by design (see the M1 plan's Global Constraints: a licence
 * key is a management credential only).
 */

const redisService = require('../services/redisService');
const licenseService = require('../services/licenseService');
const accountService = require('../services/outbound/accountService');
const sendKeyService = require('../services/outbound/sendKeyService');

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

// `Authorization: Bearer hm_send_...` only — deliberately does not fall back
// to `X-License-Key`. That header authenticates the management endpoints
// above; the Send API must never accept a licence key as a send credential.
const extractSendKey = (req) => {
  const auth = req.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length).trim();
  }
  return '';
};

const requireSendKey = async (req, res, next) => {
  try {
    const rawKey = extractSendKey(req);
    if (!rawKey) {
      return res.status(401).json({
        success: false,
        error: 'Send key required',
        code: 'SEND_KEY_REQUIRED',
      });
    }

    const validated = await sendKeyService.validateSendKey(rawKey);
    if (!validated) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired send key',
        code: 'SEND_KEY_INVALID',
      });
    }

    // The send key itself has no expiry shorter than the licence it was
    // issued under (Task 7), but the licence may have been revoked or left
    // to expire since — re-check it live rather than trusting the key alone.
    const licenseKey = await redisService.client.get(
      accountService.accountLicenseKeyIndexKey(validated.accountId)
    );
    const license = licenseKey ? await accountService.getAccountByKey(licenseKey) : null;

    if (!license || !licenseService.isActive(license)) {
      return res.status(403).json({
        success: false,
        error: 'Account licence is no longer active',
        code: 'OUTBOUND_LICENSE_INACTIVE',
      });
    }

    req.accountId = validated.accountId;
    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  requireOutboundLicense,
  requireSendKey,
};
