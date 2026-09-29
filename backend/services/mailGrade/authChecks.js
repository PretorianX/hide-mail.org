/**
 * Live SPF / DKIM / DMARC findings via mailauth.
 */

const { authenticate } = require('mailauth');
const { PENALTY } = require('./findings');

const DEFAULT_TIMEOUT_MS = 5000;

const push = (findings, severity, id, title, detail) => {
  findings.push({
    id,
    severity,
    title,
    detail,
    penalty: severity === 'pass' ? 0 : (PENALTY[severity] || 0),
  });
};

const resultOf = (section) => {
  if (!section) {
    return 'none';
  }
  if (section.status && section.status.result) {
    return String(section.status.result).toLowerCase();
  }
  if (section.result) {
    return String(section.result).toLowerCase();
  }
  return 'none';
};

const dkimOverall = (dkim) => {
  if (!dkim) {
    return 'none';
  }
  const overall = resultOf(dkim);
  if (overall && overall !== 'none') {
    return overall;
  }
  const results = Array.isArray(dkim.results) ? dkim.results : [];
  if (results.some((item) => resultOf(item) === 'pass')) {
    return 'pass';
  }
  if (results.some((item) => resultOf(item) === 'fail')) {
    return 'fail';
  }
  return overall || 'none';
};

const mapAuth = (kind, result, findings) => {
  const label = kind.toUpperCase();
  if (result === 'pass') {
    push(findings, 'pass', `${kind}_pass`, `${label} passed`, `Live ${label} check passed.`);
    return;
  }
  if (result === 'fail' || result === 'softfail') {
    push(
      findings,
      'fail',
      `${kind}_fail`,
      `${label} failed`,
      `Live ${label} check reported ${result}.`
    );
    return;
  }
  if (result === 'none' || result === 'neutral' || result === 'temperror' || result === 'permerror' || result === 'policy') {
    push(
      findings,
      'warn',
      `${kind}_weak`,
      `${label} is inconclusive`,
      `Live ${label} check reported ${result}.`
    );
  }
};

const withTimeout = (promise, timeoutMs) => {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    }),
  ]);
};

/**
 * @param {{ source: string, fromDomain: string, clientIp: string|null, timeoutMs?: number, authenticateFn?: Function }} input
 */
const buildAuthFindings = async ({
  source,
  fromDomain,
  clientIp,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  authenticateFn = authenticate,
}) => {
  const findings = [];

  if (!clientIp) {
    push(
      findings,
      'warn',
      'spf_no_ip',
      'SPF needs a sending IP',
      'This copy has no public Received client IP, so SPF cannot be fully evaluated. Send to a Mail Grade address for a stronger check.'
    );
  }

  try {
    const options = {
      sender: fromDomain ? `mailer@${fromDomain}` : undefined,
      ip: clientIp || undefined,
    };
    const result = await withTimeout(authenticateFn(source, options), timeoutMs);

    mapAuth('spf', resultOf(result.spf), findings);
    mapAuth('dkim', dkimOverall(result.dkim), findings);
    mapAuth('dmarc', resultOf(result.dmarc), findings);
  } catch (error) {
    push(
      findings,
      'warn',
      'auth_inconclusive',
      'Live auth checks timed out',
      'SPF, DKIM or DMARC DNS lookups did not finish in time. Try again in a moment.'
    );
  }

  return findings;
};

module.exports = {
  buildAuthFindings,
};
