/**
 * Scores one raw email. The source is parsed in memory and dropped.
 * Nothing here writes to Redis or disk.
 */

const dns = require('node:dns').promises;
const { simpleParser } = require('mailparser');
const { buildFindings, scoreOf, letterFor, SUMMARY } = require('./mailGrade/findings');
const { buildAuthFindings } = require('./mailGrade/authChecks');
const { buildHtmlFindings } = require('./mailGrade/htmlChecks');
const { buildReputationFindings, defaultResolveDnsbl } = require('./mailGrade/reputationChecks');
const { extractReceivedIps, isPublicIp } = require('./mailGrade/receivedIps');

const MAX_SOURCE_CHARS = 64 * 1024;
const HEADER_LINE = /^(from|to|cc|bcc|subject|date|mime-version|content-type|message-id|dkim-signature|reply-to|received):/im;

class MailGradeError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const domainOf = (address) => {
  const at = String(address || '').lastIndexOf('@');
  if (at < 0) {
    return '';
  }
  return String(address).slice(at + 1).toLowerCase();
};

const fromDomainOf = (parsed) => {
  const from = parsed.from;
  if (!from) {
    return '';
  }
  const list = Array.isArray(from.value) ? from.value : [from];
  const first = list.find((item) => item && item.address);
  return first ? domainOf(first.address) : '';
};

const collectLinkHosts = (source, parsed) => {
  const haystack = `${source}\n${parsed.text || ''}\n${parsed.html || ''}`;
  const found = haystack.match(/https?:\/\/[^\s<>"')]+/gi) || [];
  const hosts = [];
  const seen = new Set();
  found.forEach((link) => {
    try {
      const host = new URL(link.replace(/[.,;]+$/, '')).hostname.toLowerCase();
      if (host && !seen.has(host)) {
        seen.add(host);
        hosts.push(host);
      }
    } catch {
      // ignore bad URLs
    }
  });
  return hosts;
};

const resolveMxIps = async (domain) => {
  const mxRecords = await dns.resolveMx(domain);
  const sorted = (mxRecords || []).slice().sort((a, b) => a.priority - b.priority).slice(0, 3);
  const ips = [];
  await Promise.all(sorted.map(async (mx) => {
    try {
      const v4 = await dns.resolve4(mx.exchange);
      ips.push(...v4);
    } catch {
      // ignore
    }
  }));
  return [...new Set(ips.filter(isPublicIp))];
};

const gradeEmail = async (source, options = {}) => {
  if (typeof source !== 'string' || source.trim() === '') {
    throw new MailGradeError('EMPTY_EMAIL', 'Paste a raw email first.');
  }
  if (source.length > MAX_SOURCE_CHARS) {
    throw new MailGradeError('EMAIL_TOO_LARGE', 'That email is larger than 64 KB.');
  }
  if (!HEADER_LINE.test(source)) {
    throw new MailGradeError(
      'NOT_AN_EMAIL',
      'That text has no email headers. Paste the raw source, including From or Subject.'
    );
  }

  let parsed;
  try {
    parsed = await simpleParser(source);
  } catch (error) {
    throw new MailGradeError(
      'NOT_AN_EMAIL',
      'That text could not be read as an email.'
    );
  }

  const fromDomain = fromDomainOf(parsed);
  const clientIps = extractReceivedIps(source);
  const clientIp = clientIps[0] || null;
  const linkHosts = collectLinkHosts(source, parsed);

  const structural = buildFindings({ parsed, source });
  const html = buildHtmlFindings({ html: parsed.html || '', text: parsed.text || '' });

  const [auth, reputation] = await Promise.all([
    buildAuthFindings({
      source,
      fromDomain,
      clientIp,
      ...(options.authenticateFn ? { authenticateFn: options.authenticateFn } : {}),
      ...(options.authTimeoutMs ? { timeoutMs: options.authTimeoutMs } : {}),
    }),
    buildReputationFindings({
      fromDomain,
      linkHosts,
      ips: clientIps,
      resolveDnsbl: options.resolveDnsbl || defaultResolveDnsbl,
      resolveMxIps: options.resolveMxIps || resolveMxIps,
      ...(options.rblTimeoutMs ? { timeoutMs: options.rblTimeoutMs } : {}),
    }),
  ]);

  const findings = [...structural, ...auth, ...html, ...reputation];
  const score = Math.max(0, scoreOf(findings));
  const grade = letterFor(score);

  return {
    score,
    grade,
    summary: SUMMARY[grade],
    stored: false,
    findings: findings.map(({ id, severity, title, detail }) => ({
      id,
      severity,
      title,
      detail,
    })),
  };
};

module.exports = {
  gradeEmail,
  MailGradeError,
  MAX_SOURCE_CHARS,
  resolveMxIps,
};
