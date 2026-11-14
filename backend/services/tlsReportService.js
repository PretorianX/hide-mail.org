/**
 * TLS Reports. Turns one SMTP TLS report into the hosts that failed the handshake.
 * The browser report and the paid API share this reader.
 */

const { readTlsReport, TlsReportError } = require('./tlsReport/readReport');

module.exports = {
  readTlsReport,
  TlsReportError,
};
