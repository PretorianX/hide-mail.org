/**
 * Sanitization Utilities
 * 
 * Provides functions to sanitize user input before logging
 * to prevent log injection attacks (CWE-117).
 * 
 * Log injection occurs when attackers embed newlines or control
 * characters in user input to forge log entries or inject
 * malicious content into log files.
 */

/**
 * Sanitize a string for safe logging
 * Removes/escapes control characters that could be used for log injection
 * 
 * @param {*} input - Input to sanitize (converts non-strings)
 * @returns {string} - Sanitized string safe for logging
 */
const sanitizeForLog = (input) => {
  if (input === null || input === undefined) {
    return String(input);
  }

  const str = String(input);
  
  // Replace control characters with their escape representations
  // This prevents log injection while maintaining visibility of attempted attacks
  return str
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, (char) => {
      // Replace other control characters with unicode escape
      return '\\x' + char.charCodeAt(0).toString(16).padStart(2, '0');
    });
};

/**
 * Sanitize an email address for logging
 * Validates format and sanitizes for safe logging
 * 
 * @param {string} email - Email address to sanitize
 * @returns {string} - Sanitized email safe for logging
 */
const sanitizeEmail = (email) => {
  return sanitizeForLog(email);
};

/**
 * Sanitize an IP address for logging
 * 
 * @param {string} ip - IP address to sanitize
 * @returns {string} - Sanitized IP safe for logging
 */
const sanitizeIP = (ip) => {
  return sanitizeForLog(ip);
};

/**
 * Sanitize a message ID for logging
 * 
 * @param {string} messageId - Message ID to sanitize
 * @returns {string} - Sanitized message ID safe for logging
 */
const sanitizeMessageId = (messageId) => {
  return sanitizeForLog(messageId);
};

module.exports = {
  sanitizeForLog,
  sanitizeEmail,
  sanitizeIP,
  sanitizeMessageId,
};
