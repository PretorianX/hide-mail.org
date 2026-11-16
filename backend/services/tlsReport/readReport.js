/**
 * Read one RFC 8460 SMTP TLS report.
 * The JSON is parsed in memory and dropped. Nothing here writes to Redis or disk.
 */

const MAX_SOURCE_CHARS = 64 * 1024;
const MAX_POLICIES = 40;
const MAX_FAILURES = 100;
const MAX_HOSTS = 20;

const POLICY_LABELS = {
  sts: 'MTA-STS',
  tlsa: 'DANE',
  'no-policy-found': 'No policy',
};

const RESULT_REASONS = {
  'starttls-not-supported': 'The receiving host did not offer STARTTLS.',
  'certificate-host-mismatch': 'The certificate name did not match the host.',
  'certificate-expired': 'The certificate had expired.',
  'certificate-not-trusted': 'The certificate was not trusted.',
  'validation-failure': 'The certificate failed validation.',
  'tlsa-invalid': 'The DANE TLSA record did not match.',
  'dnssec-invalid': 'DNSSEC validation failed.',
  'dane-required': 'DANE was required and was not satisfied.',
  'sts-policy-invalid': 'The MTA-STS policy was invalid.',
  'sts-policy-fetch-error': 'The MTA-STS policy could not be fetched.',
  'sts-webpki-invalid': 'The MTA-STS certificate failed WebPKI checks.',
};

const RESULT_CLAUSES = {
  'starttls-not-supported': 'did not offer STARTTLS',
  'certificate-host-mismatch': 'presented a certificate for the wrong name',
  'certificate-expired': 'presented an expired certificate',
  'certificate-not-trusted': 'presented a certificate that was not trusted',
  'validation-failure': 'failed certificate validation',
  'tlsa-invalid': 'did not match its DANE TLSA record',
  'dnssec-invalid': 'failed DNSSEC validation',
  'dane-required': 'did not satisfy a required DANE policy',
  'sts-policy-invalid': 'had an invalid MTA-STS policy',
  'sts-policy-fetch-error': 'could not fetch its MTA-STS policy',
  'sts-webpki-invalid': 'failed the MTA-STS WebPKI check',
};

const HOST_PATTERN = /^(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
const RESULT_TYPE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

class TlsReportError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new TlsReportError(code, message);
};

const notAReport = (message) => fail(
  'NOT_A_TLS_REPORT',
  message || 'That text is not an SMTP TLS report.'
);

const textField = (value, max, label) => {
  if (typeof value !== 'string') {
    notAReport(`That JSON is not an SMTP TLS report. ${label} is missing.`);
  }
  const text = value.trim();
  if (!text || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) {
    notAReport(`That JSON is not an SMTP TLS report. ${label} is missing.`);
  }
  return text;
};

const countField = (value) => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    notAReport('That JSON is not an SMTP TLS report. A session count is missing.');
  }
  return value;
};

const hostname = (value) => {
  const text = textField(value, 253, 'A host name').toLowerCase().replace(/\.$/, '');
  if (!HOST_PATTERN.test(text)) {
    notAReport('That JSON is not an SMTP TLS report. A host name is not valid.');
  }
  return text;
};

const endpoint = (value, label) => textField(value, 64, label);

const policyMode = (policyString) => {
  if (!Array.isArray(policyString)) {
    notAReport('That JSON is not an SMTP TLS report. The policy text is missing.');
  }
  for (const line of policyString) {
    if (typeof line !== 'string') {
      notAReport('That JSON is not an SMTP TLS report. The policy text is missing.');
    }
    const match = line.trim().match(/^mode:\s*([a-z]{1,32})$/i);
    if (match) {
      return match[1].toLowerCase();
    }
  }
  return null;
};

const readFailure = (detail) => {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) {
    notAReport('That JSON is not an SMTP TLS report. A failure row is missing.');
  }
  const resultType = textField(detail['result-type'], 64, 'A result type').toLowerCase();
  if (!RESULT_TYPE_PATTERN.test(resultType)) {
    notAReport('That JSON is not an SMTP TLS report. A result type is missing.');
  }
  const receivingHost = hostname(detail['receiving-mx-hostname']);
  return {
    resultType,
    reason: RESULT_REASONS[resultType] || `The report listed this failure: ${resultType}.`,
    receivingHost,
    receivingIp: endpoint(detail['receiving-ip'], 'A receiving address'),
    sendingIp: endpoint(detail['sending-mta-ip'], 'A sending address'),
    failedSessions: countField(detail['failed-session-count']),
  };
};

const readPolicy = (entry) => {
  const policy = entry && entry.policy;
  const summary = entry && entry.summary;
  if (!policy || typeof policy !== 'object' || !summary || typeof summary !== 'object') {
    notAReport('That JSON is not an SMTP TLS report.');
  }
  const policyType = textField(policy['policy-type'], 32, 'A policy type').toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(POLICY_LABELS, policyType)) {
    notAReport('That JSON is not an SMTP TLS report. The policy type is not STS, DANE, or no-policy-found.');
  }
  const mxHosts = policy['mx-host'];
  if (!Array.isArray(mxHosts) || mxHosts.length > MAX_HOSTS) {
    notAReport('That JSON is not an SMTP TLS report. The MX host list is missing.');
  }
  const details = entry['failure-details'] || [];
  if (!Array.isArray(details) || details.length > MAX_FAILURES) {
    fail('TLS_TOO_LARGE', 'That report is too large to read.');
  }
  return {
    domain: hostname(policy['policy-domain']),
    policyType,
    policyLabel: POLICY_LABELS[policyType],
    mode: policyMode(policy['policy-string']),
    mxHosts: mxHosts.map((host) => hostname(host)),
    successfulSessions: countField(summary['total-successful-session-count']),
    failedSessions: countField(summary['total-failure-session-count']),
    failures: details.map(readFailure),
  };
};

const headline = (failedSessions, policies) => {
  if (failedSessions === 0 && policies.every((item) => item.successfulSessions === 0)) {
    return {
      stamp: 'EMPTY',
      verdict: 'empty',
      summary: 'The report counted no SMTP sessions.',
    };
  }
  const listed = policies.flatMap((item) => item.failures);
  const anyListedFailure = listed.some((item) => item.failedSessions > 0);
  if (failedSessions === 0 && !anyListedFailure) {
    return {
      stamp: 'CLEAR',
      verdict: 'clear',
      summary: 'Every counted session negotiated TLS.',
    };
  }
  const worst = listed.reduce((best, item) => (
    !best || item.failedSessions > best.failedSessions ? item : best
  ), null);
  const clause = worst
    ? `${worst.receivingHost} ${RESULT_CLAUSES[worst.resultType] || `failed TLS (${worst.resultType})`}.`
    : 'The report did not name the hosts.';
  return {
    stamp: 'FAILURES',
    verdict: 'failures',
    summary: `${failedSessions || listed.reduce((sum, item) => sum + item.failedSessions, 0)} sessions failed TLS. ${clause}`,
  };
};

const readTlsReport = (source) => {
  if (typeof source !== 'string') {
    notAReport();
  }
  if (source.length > MAX_SOURCE_CHARS) {
    fail('TLS_TOO_LARGE', 'That report is larger than 64 KB.');
  }
  const trimmed = source.trim().replace(/^\uFEFF/, '');
  if (!trimmed) {
    fail('EMPTY_TLS_REPORT', 'Paste an SMTP TLS report first.');
  }
  if (trimmed.charCodeAt(0) === 0x1f && trimmed.charCodeAt(1) === 0x8b) {
    fail('UNZIP_TLS_REPORT', 'Unzip the report first. TLS Reports reads the JSON file.');
  }
  if (trimmed.startsWith('<')) {
    notAReport('Paste the JSON TLS report. An XML aggregate belongs on DMARC Reports.');
  }
  let document;
  try {
    document = JSON.parse(trimmed);
  } catch {
    notAReport('Paste the JSON TLS report.');
  }
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    notAReport();
  }
  if (!Array.isArray(document.policies) || document.policies.length === 0) {
    notAReport();
  }
  if (document.policies.length > MAX_POLICIES) {
    fail('TLS_TOO_LARGE', 'That report is too large to read.');
  }
  const dateRange = document['date-range'];
  if (!dateRange || typeof dateRange !== 'object') {
    notAReport();
  }
  const start = textField(dateRange['start-datetime'], 40, 'The start time');
  const end = textField(dateRange['end-datetime'], 40, 'The end time');
  if (Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) {
    notAReport('That JSON is not an SMTP TLS report. The date range is missing.');
  }
  const policies = document.policies.map(readPolicy);
  const successfulSessions = policies.reduce((sum, item) => sum + item.successfulSessions, 0);
  const failedSessions = policies.reduce((sum, item) => sum + item.failedSessions, 0);
  return {
    stored: false,
    ...headline(failedSessions, policies),
    organization: textField(document['organization-name'], 200, 'The organization'),
    contact: textField(document['contact-info'], 200, 'The contact'),
    reportId: textField(document['report-id'], 200, 'The report id'),
    start,
    end,
    successfulSessions,
    failedSessions,
    policies,
  };
};

module.exports = {
  readTlsReport,
  TlsReportError,
  MAX_SOURCE_CHARS,
};
