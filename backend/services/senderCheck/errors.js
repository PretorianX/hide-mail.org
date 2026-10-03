/**
 * Failures a caller can show. DNS and validation never become a partial report.
 */

class SenderCheckError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SenderCheckError';
    this.code = code;
  }
}

module.exports = {
  SenderCheckError,
};
