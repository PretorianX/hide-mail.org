/**
 * Sender Check looks up MX, SPF, and DMARC for one domain and returns a report.
 * The domain is not stored.
 */

const dns = require('node:dns').promises;
const { SenderCheckError } = require('./senderCheck/errors');
const { normalizeDomain } = require('./senderCheck/domainName');
const {
  interpretMx,
  interpretSpf,
  interpretDmarc,
  verdictFor,
  summaryFor,
  notInDns,
} = require('./senderCheck/records');

const ABSENT = new Set(['ENOTFOUND', 'ENODATA', 'ENONAME']);

const defaultResolver = {
  resolveMx: (name) => dns.resolveMx(name),
  resolveTxt: (name) => dns.resolveTxt(name),
};

const query = async (resolver, method, name) => {
  try {
    const records = await resolver[method](name);
    return { records: records || [] };
  } catch (error) {
    if (error && ABSENT.has(error.code)) {
      return { records: [], nxdomain: error.code === 'ENOTFOUND' };
    }
    throw new SenderCheckError('DNS_UNAVAILABLE', 'The DNS lookup did not answer. Try again.');
  }
};

const checkDomain = async (input, options = {}) => {
  const domain = normalizeDomain(input);
  const resolver = options.resolver || defaultResolver;

  const mx = await query(resolver, 'resolveMx', domain);
  if (mx.nxdomain) {
    return notInDns(domain);
  }

  const txt = await query(resolver, 'resolveTxt', domain);
  const dmarc = await query(resolver, 'resolveTxt', `_dmarc.${domain}`);
  const records = [
    interpretMx(mx.records),
    interpretSpf(txt.records),
    interpretDmarc(dmarc.records),
  ];
  const verdict = verdictFor(records);

  return {
    domain,
    verdict,
    summary: summaryFor(domain, verdict, false),
    stored: false,
    records,
  };
};

module.exports = {
  checkDomain,
  SenderCheckError,
};
