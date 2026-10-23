class DmarcReportError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DmarcReportError';
    this.code = code;
  }
}

module.exports = { DmarcReportError };
