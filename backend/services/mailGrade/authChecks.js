/**
 * Live SPF / DKIM / DMARC findings via mailauth, plus ARC, BIMI, and MTA-STS inspection.
 */

const dns = require('node:dns').promises;
const { authenticate } = require('mailauth');
const { PENALTY } = require('./findings');
const { createDnsCache } = require('./dnsCache');

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_TXT_TIMEOUT_MS = 1500;
const txtDnsCache = createDnsCache({ ttlMs: 10 * 60 * 1000 });

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

const inspectArcHeaders = (source) => {
  const raw = String(source || '');
  const seals = [...raw.matchAll(/^arc-seal\s*:\s*([^\r\n]+(?:\r?\n[ \t]+[^\r\n]+)*)/gim)];
  const msgSigs = [...raw.matchAll(/^arc-message-signature\s*:\s*([^\r\n]+(?:\r?\n[ \t]+[^\r\n]+)*)/gim)];
  const authResults = [...raw.matchAll(/^arc-authentication-results\s*:\s*([^\r\n]+(?:\r?\n[ \t]+[^\r\n]+)*)/gim)];

  const chainCount = Math.max(seals.length, msgSigs.length, authResults.length);
  if (chainCount === 0) {
    return { present: false, status: 'none', chainCount: 0 };
  }

  let status = 'none';
  for (const match of seals) {
    const flat = match[1].replace(/\r?\n[ \t]+/g, ' ');
    const cvMatch = flat.match(/(?:^|;)\s*cv\s*=\s*([a-z]+)/i);
    if (cvMatch) {
      const cv = cvMatch[1].toLowerCase();
      if (cv === 'fail') {
        status = 'fail';
        break;
      }
      if (cv === 'pass') {
        status = 'pass';
      }
    }
  }

  if (status === 'none') {
    for (const match of authResults) {
      const flat = match[1].replace(/\r?\n[ \t]+/g, ' ');
      const arcMatch = flat.match(/\barc\s*=\s*(pass|fail|none)/i);
      if (arcMatch) {
        status = arcMatch[1].toLowerCase();
        break;
      }
    }
  }

  return {
    present: true,
    status,
    chainCount,
  };
};

const defaultResolveTxt = async (host) => dns.resolveTxt(host);

const lookupTxtRecord = async (host, pattern, { resolveTxt = defaultResolveTxt, timeoutMs = DEFAULT_TXT_TIMEOUT_MS, useCache = true } = {}) => {
  try {
    const loader = () => withTimeout(Promise.resolve(resolveTxt(host)), timeoutMs);
    const records = useCache ? await txtDnsCache.get(`txt:${host}`, loader) : await loader();
    const joined = (Array.isArray(records) ? records : [])
      .map((entry) => (Array.isArray(entry) ? entry.join('') : String(entry || '')))
      .map((str) => str.trim())
      .filter(Boolean);
    const matched = pattern ? joined.find((rec) => pattern.test(rec)) : joined[0];
    return matched ? { present: true, record: matched } : { present: false, record: null };
  } catch {
    return { present: false, record: null };
  }
};

const inspectTransportAndBrandTxt = async (fromDomain, options = {}) => {
  const cleanDomain = String(fromDomain || '').toLowerCase().replace(/\.$/, '');
  if (!cleanDomain) {
    return {
      bimi: { present: false, record: null },
      mtaSts: { present: false, record: null },
    };
  }

  const customResolver = options.resolveTxt
    || (options.dns && typeof options.dns.resolveTxt === 'function'
      ? options.dns.resolveTxt.bind(options.dns)
      : null);
  const resolveTxt = customResolver || defaultResolveTxt;
  const useCache = !customResolver;
  const timeoutMs = options.txtTimeoutMs || DEFAULT_TXT_TIMEOUT_MS;

  const [bimi, mtaSts] = await Promise.all([
    lookupTxtRecord(`default._bimi.${cleanDomain}`, /v\s*=\s*BIMI1/i, { resolveTxt, timeoutMs, useCache }),
    lookupTxtRecord(`_mta-sts.${cleanDomain}`, /v\s*=\s*STSv1/i, { resolveTxt, timeoutMs, useCache }),
  ]);

  return { bimi, mtaSts };
};

module.exports = {
  buildAuthFindings,
  inspectArcHeaders,
  inspectTransportAndBrandTxt,
};
