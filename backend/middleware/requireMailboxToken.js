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
      const rawEmail = extractEmail(req);

      if (!rawEmail || typeof rawEmail !== 'string' || !rawEmail.includes('@')) {
        return res.status(400).json({
          success: false,
          error: 'Invalid email address',
        });
      }

      const email = rawEmail.trim().toLowerCase();
      const token = req.get('X-Mailbox-Token');
      const meta = await redisService.getMailboxMeta(email);
      const isValid = Boolean(meta?.tokenHash && verifyMailboxToken(token, meta.tokenHash));

      if (!isValid) {
        return res.status(401).json({
          success: false,
          error: token ? 'Invalid or expired mailbox token' : 'Mailbox token is required',
          code: token ? 'INVALID_MAILBOX_TOKEN' : 'MAILBOX_TOKEN_REQUIRED',
        });
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = requireMailboxToken;
