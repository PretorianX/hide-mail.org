/**
 * Scores one raw email. The source is parsed in memory and dropped.
 * Nothing here writes to Redis or disk.
 */

const dns = require('node:dns').promises;
const { simpleParser } = require('mailparser');
const { buildFindings, scoreOf, letterFor, SUMMARY } = require('./mailGrade/findings');
const {
  buildAuthFindings,
  inspectArcHeaders,
  inspectTransportAndBrandTxt,
} = require('./mailGrade/authChecks');
const {
  buildHtmlFindings,
  extractShortenerLinks,
  extractPunycodeDomains,
} = require('./mailGrade/htmlChecks');
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

const fromAddressOf = (parsed) => {
  const from = parsed.from;
  if (!from) {
    return null;
  }
  const list = Array.isArray(from.value) ? from.value : [from];
  const first = list.find((item) => item && item.address);
  return first ? first.address : null;
};

const fromDomainOf = (parsed) => {
  const addr = fromAddressOf(parsed);
  return addr ? domainOf(addr) : '';
};

const extractDkimMeta = (source) => {
  const match = String(source || '').match(/^dkim-signature\s*:\s*([^\r\n]+(?:\r?\n[ \t]+[^\r\n]+)*)/im);
  if (!match) {
    return { present: false, domain: null, selector: null };
  }
  const raw = match[1].replace(/\r?\n[ \t]+/g, ' ');
  const dMatch = raw.match(/(?:^|;)\s*d\s*=\s*([^;\s]+)/i);
  const sMatch = raw.match(/(?:^|;)\s*s\s*=\s*([^;\s]+)/i);
  return {
    present: true,
    domain: dMatch ? dMatch[1].toLowerCase().replace(/\.$/, '') : null,
    selector: sMatch ? sMatch[1] : null,
  };
};

const categoryForFinding = (id) => {
  if (id.startsWith('spf_') || id.startsWith('dkim_') || id.startsWith('dmarc_') || id === 'auth_inconclusive') {
    return 'Authentication';
  }
  if (id.startsWith('rbl_')) {
    return 'Reputation';
  }
  if (
    id.startsWith('from_')
    || id.startsWith('subject_')
    || id.startsWith('date_')
    || id.startsWith('message_id_')
    || id.startsWith('reply_to_')
    || id.startsWith('list_unsubscribe')
  ) {
    return 'Headers';
  }
  return 'Content & Formatting';
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
  const arc = inspectArcHeaders(source);

  const [auth, reputation, transportTxt] = await Promise.all([
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
    inspectTransportAndBrandTxt(fromDomain, options),
  ]);

  const findings = [...structural, ...auth, ...html, ...reputation];
  const score = Math.max(0, scoreOf(findings));
  const grade = letterFor(score);

  const fromAddress = fromAddressOf(parsed);
  const replyToList = parsed.replyTo?.value || [];
  const replyTo = replyToList[0]?.address || null;
  const returnPathMatch = source.match(/^return-path\s*:\s*<?([^>\r\n]+)>?/im);
  const returnPath = returnPathMatch ? returnPathMatch[1].trim() : null;
  const contentTypeMatch = source.match(/^content-type\s*:\s*([^\r\n;]+)/im);
  const contentType = contentTypeMatch ? contentTypeMatch[1].trim().toLowerCase() : 'text/plain';
  const receivedHops = (source.match(/^received\s*:/gim) || []).length;
  const dkimMeta = extractDkimMeta(source);
  const dkimAligned = Boolean(
    dkimMeta.domain
    && fromDomain
    && (dkimMeta.domain === fromDomain || dkimMeta.domain.endsWith(`.${fromDomain}`))
  );

  const allLinks = [...new Set(
    (`${source}\n${parsed.text || ''}\n${parsed.html || ''}`.match(/https?:\/\/[^\s<>"')]+/gi) || [])
      .map((link) => link.replace(/[.,;]+$/, ''))
  )];
  const httpsLinks = allLinks.filter((link) => link.toLowerCase().startsWith('https://')).length;
  const httpLinks = allLinks.filter((link) => link.toLowerCase().startsWith('http://')).length;
  const htmlStr = String(parsed.html || '');
  const textStr = String(parsed.text || '');
  const hasTextPart = /content-type:\s*text\/plain/i.test(source) || Boolean(textStr.trim() && !htmlStr.trim());
  const hasHtmlPart = Boolean(htmlStr.trim()) || /content-type:\s*text\/html/i.test(source);
  const imageCount = (htmlStr.match(/<img\b/gi) || []).length;
  const listUnsubscribePresent = /^list-unsubscribe\s*:/im.test(source)
    || Boolean(parsed.headers && parsed.headers.get('list') && parsed.headers.get('list').unsubscribe);
  const listUnsubscribeOneClick = /^list-unsubscribe-post\s*:[^\r\n]*list-unsubscribe=one-click/im.test(source);
  const combinedHaystack = `${source}\n${textStr}\n${htmlStr}`;
  const shortenerLinks = extractShortenerLinks(combinedHaystack);
  const punycodeDomains = extractPunycodeDomains(combinedHaystack);

  const authStatusOf = (prefix) => {
    const match = auth.find((item) => item.id.startsWith(`${prefix}_`));
    if (!match) return 'none';
    if (match.id === `${prefix}_pass`) return 'pass';
    if (match.id === `${prefix}_fail`) return 'fail';
    return 'warn';
  };

  return {
    score,
    grade,
    summary: SUMMARY[grade],
    stored: false,
    envelope: {
      from: parsed.from?.text || fromAddress || null,
      fromAddress,
      fromDomain: fromDomain || null,
      to: parsed.to?.text || null,
      replyTo,
      returnPath,
      subject: (parsed.subject || '').trim() || null,
      subjectLength: (parsed.subject || '').trim().length,
      date: parsed.date ? parsed.date.toISOString() : null,
      messageId: parsed.messageId || null,
      contentType,
      sizeBytes: Buffer.byteLength(source, 'utf8'),
      receivedHops,
      clientIp,
      receivedIps: clientIps,
    },
    authentication: {
      spf: {
        status: authStatusOf('spf'),
        clientIp,
      },
      dkim: {
        status: authStatusOf('dkim'),
        present: dkimMeta.present,
        domain: dkimMeta.domain,
        selector: dkimMeta.selector,
        aligned: dkimAligned,
      },
      dmarc: {
        status: authStatusOf('dmarc'),
        fromDomain: fromDomain || null,
      },
      arc,
      bimi: transportTxt.bimi,
      mtaSts: transportTxt.mtaSts,
      listUnsubscribe: {
        present: listUnsubscribePresent,
        oneClick: listUnsubscribeOneClick,
      },
    },
    deliverability: {
      hasTextPart,
      hasHtmlPart,
      textBytes: Buffer.byteLength(textStr, 'utf8'),
      htmlBytes: Buffer.byteLength(htmlStr, 'utf8'),
      totalLinks: allLinks.length,
      httpsLinks,
      httpLinks,
      uniqueHosts: linkHosts,
      shortenerLinks,
      punycodeDomains,
      imageCount,
      attachmentCount: Array.isArray(parsed.attachments) ? parsed.attachments.length : 0,
    },
    findings: findings.map(({ id, severity, title, detail, penalty }) => ({
      id,
      severity,
      title,
      detail,
      penalty: penalty || 0,
      category: categoryForFinding(id),
    })),
  };
};

module.exports = {
  gradeEmail,
  MailGradeError,
  MAX_SOURCE_CHARS,
  resolveMxIps,
};
