/**
 * Public DNSBL checks for From-domain, link hosts, and sending IPs.
 */

const dns = require('node:dns').promises;
const { PENALTY } = require('./findings');
const { createDnsCache } = require('./dnsCache');
const { isPublicIp } = require('./receivedIps');

const DOMAIN_BLS = [
  'dbl.spamhaus.org',
  'multi.surbl.org',
  'multi.uribl.com',
];

const IP_BLS = [
  'zen.spamhaus.org',
  'bl.spamcop.net',
  'b.barracudacentral.org',
  'dnsbl.sorbs.net',
];

const MAX_IPS = 8;
const MAX_LINK_HOSTS = 10;
const DEFAULT_TIMEOUT_MS = 1500;
const dnsCache = createDnsCache({ ttlMs: 10 * 60 * 1000 });

const push = (findings, severity, id, title, detail) => {
  findings.push({
    id,
    severity,
    title,
    detail,
    penalty: severity === 'pass' ? 0 : (PENALTY[severity] || 0),
  });
};

const reverseIp = (ip) => {
  if (ip.includes(':')) {
    // Skip expanded IPv6 nibble form for v1; most public RBLs used here are IPv4-first.
    return null;
  }
  return ip.split('.').reverse().join('.');
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

const defaultResolveDnsbl = async (query) => {
  try {
    const answers = await dns.resolve4(query);
    return answers && answers.length ? answers : null;
  } catch (error) {
    if (error && (error.code === 'ENOTFOUND' || error.code === 'ENODATA')) {
      return null;
    }
    throw error;
  }
};

/**
 * @param {{
 *   fromDomain: string,
 *   linkHosts: string[],
 *   ips: string[],
 *   resolveDnsbl?: Function,
 *   timeoutMs?: number,
 *   resolveMxIps?: Function,
 * }} input
 */
const buildReputationFindings = async ({
  fromDomain,
  linkHosts = [],
  ips = [],
  resolveDnsbl = defaultResolveDnsbl,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  resolveMxIps,
}) => {
  const findings = [];
  let inconclusive = false;
  const listedDomains = [];
  const listedIps = [];

  const domains = [...new Set(
    [fromDomain, ...linkHosts]
      .map((d) => String(d || '').toLowerCase().replace(/\.$/, ''))
      .filter(Boolean)
  )].slice(0, MAX_LINK_HOSTS + 1);

  let checkIps = [...new Set(ips.filter((ip) => isPublicIp(ip)))].slice(0, MAX_IPS);

  if (resolveMxIps && fromDomain) {
    try {
      const mxIps = await resolveMxIps(fromDomain);
      checkIps = [...new Set([...checkIps, ...mxIps.filter(isPublicIp)])].slice(0, MAX_IPS);
    } catch {
      inconclusive = true;
    }
  }

  const lookup = async (query) => {
    try {
      return await dnsCache.get(`rbl:${query}`, () => withTimeout(resolveDnsbl(query), timeoutMs));
    } catch {
      inconclusive = true;
      return null;
    }
  };

  await Promise.all(domains.flatMap((domain) => DOMAIN_BLS.map(async (zone) => {
    const answers = await lookup(`${domain}.${zone}`);
    if (answers) {
      listedDomains.push(`${domain} (${zone})`);
    }
  })));

  await Promise.all(checkIps.flatMap((ip) => {
    const rev = reverseIp(ip);
    if (!rev) {
      return [];
    }
    return IP_BLS.map(async (zone) => {
      const answers = await lookup(`${rev}.${zone}`);
      if (answers) {
        listedIps.push(`${ip} (${zone})`);
      }
    });
  }));

  if (listedDomains.length) {
    push(
      findings,
      'fail',
      'rbl_domain',
      'Domain on a public blocklist',
      `Listed: ${[...new Set(listedDomains)].slice(0, 5).join(', ')}.`
    );
  }

  if (listedIps.length) {
    push(
      findings,
      'fail',
      'rbl_ip',
      'Sending IP on a public blocklist',
      `Listed: ${[...new Set(listedIps)].slice(0, 5).join(', ')}.`
    );
  }

  if (inconclusive) {
    push(
      findings,
      'warn',
      'rbl_inconclusive',
      'Reputation checks incomplete',
      'One or more public DNSBL lookups timed out or failed.'
    );
  }

  if (!listedDomains.length && !listedIps.length && !inconclusive && (domains.length || checkIps.length)) {
    push(
      findings,
      'pass',
      'rbl_clean',
      'Not listed on checked RBLs',
      'From-domain, sampled link hosts, and checked IPs were clean on the public lists we query.'
    );
  }

  return findings;
};

module.exports = {
  buildReputationFindings,
  DOMAIN_BLS,
  IP_BLS,
  defaultResolveDnsbl,
};
