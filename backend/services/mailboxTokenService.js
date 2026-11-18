const crypto = require('crypto');

const TOKEN_BYTES = 32; // 256-bit capability token
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/i;

/**
 * Generate a cryptographically random >=128-bit mailbox capability token.
 * @returns {string} URL-safe base64 capability token
 */
function generateMailboxToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

/**
 * Hash a mailbox capability token with SHA-256 for Redis storage.
 * @param {string} token
 * @returns {string} 64-char hex digest
 */
function hashMailboxToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/**
 * Constant-time verification of a presented capability token against a stored SHA-256 hex digest.
 * @param {string} providedToken
 * @param {string} expectedHashHex
 * @returns {boolean}
 */
function verifyMailboxToken(providedToken, expectedHashHex) {
  if (typeof providedToken !== 'string' || providedToken.length === 0) {
    return false;
  }
  if (typeof expectedHashHex !== 'string' || !SHA256_HEX_PATTERN.test(expectedHashHex)) {
    return false;
  }

  const providedDigest = crypto.createHash('sha256').update(providedToken).digest();
  const expectedDigest = Buffer.from(expectedHashHex, 'hex');

  if (providedDigest.length !== expectedDigest.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedDigest, expectedDigest);
}

module.exports = {
  generateMailboxToken,
  hashMailboxToken,
  verifyMailboxToken,
};
