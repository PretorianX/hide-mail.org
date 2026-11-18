const redisService = require('../services/redisService');
const { verifyMailboxToken } = require('../services/mailboxTokenService');

/**
 * Middleware factory enforcing per-mailbox capability token authentication.
 * Reads the token from the `X-Mailbox-Token` header and verifies its SHA-256
 * hash against `mailbox_meta:<email>` using constant-time comparison.
 *
 * @param {(req: import('express').Request) => string|undefined} extractEmail
 * @returns {import('express').RequestHandler}
 */
function requireMailboxToken(extractEmail) {
  return async (req, res, next) => {
    try {
      const email = extractEmail(req);

      if (!email || typeof email !== 'string' || !email.includes('@')) {
        return res.status(400).json({
          success: false,
          error: 'Invalid email address',
        });
      }

      const token = req.get('X-Mailbox-Token');
      if (!token) {
        return res.status(401).json({
          success: false,
          error: 'Mailbox token is required',
          code: 'MAILBOX_TOKEN_REQUIRED',
        });
      }

      const meta = await redisService.getMailboxMeta(email);
      if (!meta || !meta.tokenHash || !verifyMailboxToken(token, meta.tokenHash)) {
        return res.status(401).json({
          success: false,
          error: 'Invalid or expired mailbox token',
          code: 'INVALID_MAILBOX_TOKEN',
        });
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = requireMailboxToken;
