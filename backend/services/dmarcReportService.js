/**
 * Read a DMARC aggregate report (RFC 7489) into a source-by-source summary.
 * The XML is scored in memory and is not stored.
 */

const dns = require('node:dns').promises;
const zlib = require('node:zlib');
const { DmarcReportError } = require('./dmarcReport/errors');
const { parseXml, child, children, textOf } = require('./dmarcReport/parseXml');

const MAX_XML_CHARS = 512 * 1024;
const MAX_DECOMPRESSED_BYTES = 256 * 1024;
const MAX_SOURCES = 2000;
const MAX_FIELD = 300;
const MAX_COUNT = 1_000_000_000;
const PTR_TIMEOUT_MS = 1500;

const KNOWN_ESPS = [
  { provider: 'Google Workspace', suffixes: ['google.com', '1e100.net', 'gmail.com', 'googlemail.com'] },
  { provider: 'Microsoft 365', suffixes: ['outbound.protection.outlook.com', 'protection.outlook.com', 'outlook.com', 'onmicrosoft.com'] },
  { provider: 'Amazon SES', suffixes: ['amazonses.com'] },
  { provider: 'SendGrid', suffixes: ['sendgrid.net', 'sendgrid.info'] },
  { provider: 'Mailgun', suffixes: ['mailgun.org', 'mailgun.us', 'mailgun.net'] },
  { provider: 'Mailchimp / Mandrill', suffixes: ['mcsv.net', 'mandrillapp.com', 'rsgsv.net', 'mcdlv.net'] },
  { provider: 'Postmark', suffixes: ['mtasv.net', 'pm-bounces.com'] },
  { provider: 'Fastmail', suffixes: ['messagingengine.com', 'fastmail.com'] },
  { provider: 'Proton', suffixes: ['protonmail.ch', 'proton.me'] },
  { provider: 'Cloudflare', suffixes: ['cloudflare.net'] },
];

const NON_ROUTABLE_IPV4 = /^(?:127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)/;

const matchesDomainSuffix = (host, suffix) => host === suffix || host.endsWith(`.${suffix}`);

const extractDomain = (value) => {
  if (!value) return null;
  const cleaned = String(value).trim().replace(/\.$/, '').toLowerCase();
  const atIndex = cleaned.lastIndexOf('@');
  return atIndex === -1 ? cleaned : cleaned.slice(atIndex + 1);
};

const classifyProvider = ({ ptrHost, envelopeFrom, authResults }) => {
  const candidates = [
    extractDomain(ptrHost),
    extractDomain(envelopeFrom),
    ...(authResults?.spf || []).map((item) => extractDomain(item.domain)),
    ...(authResults?.dkim || []).map((item) => extractDomain(item.domain)),
  ].filter(Boolean);

  for (const candidate of candidates) {
    for (const esp of KNOWN_ESPS) {
      if (esp.suffixes.some((suffix) => matchesDomainSuffix(candidate, suffix))) {
        return esp.provider;
      }
    }
  }
  return null;
};

const resolvePtrHost = async (ip, customDns) => {
  if (!ip) return null;
  if (!customDns && (NON_ROUTABLE_IPV4.test(ip) || ip === '::1' || ip.toLowerCase().startsWith('2001:db8:'))) {
    return null;
  }
  const resolver = customDns || dns;
  if (typeof resolver?.reverse !== 'function') {
    return null;
  }
  let timer = null;
  try {
    const hosts = await Promise.race([
      resolver.reverse(ip),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('PTR_TIMEOUT')), PTR_TIMEOUT_MS);
      }),
    ]);
    if (Array.isArray(hosts) && hosts.length > 0 && hosts[0]) {
      return String(hosts[0]).trim().replace(/\.$/, '').toLowerCase() || null;
    }
    return null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const extractZipXmlBuffer = (buf) => {
  let offset = 0;
  while (offset + 30 <= buf.length) {
    const sig = buf.readUInt32LE(offset);
    if (sig !== 0x04034b50) {
      break;
    }
    const method = buf.readUInt16LE(offset + 8);
    const compressedSize = buf.readUInt32LE(offset + 18);
    const uncompressedSize = buf.readUInt32LE(offset + 22);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const dataStart = offset + 30 + nameLen + extraLen;
    if (dataStart > buf.length) {
      throw new DmarcReportError('REPORT_UNREADABLE', 'This report could not be read.');
    }
    const entryName = buf.subarray(offset + 30, offset + 30 + nameLen).toString('utf8');
    const dataEnd = compressedSize > 0 ? dataStart + compressedSize : buf.length;
    if (dataEnd > buf.length) {
      throw new DmarcReportError('REPORT_UNREADABLE', 'This report could not be read.');
    }

    if (entryName.toLowerCase().endsWith('.xml')) {
      if (uncompressedSize > MAX_DECOMPRESSED_BYTES) {
        throw new DmarcReportError('REPORT_TOO_LARGE', 'That report is too large.');
      }
      const compressedSlice = buf.subarray(dataStart, dataEnd);
      if (method === 0) {
        if (compressedSlice.length > MAX_DECOMPRESSED_BYTES) {
          throw new DmarcReportError('REPORT_TOO_LARGE', 'That report is too large.');
        }
        return compressedSlice;
      }
      if (method === 8) {
        try {
          return zlib.inflateRawSync(compressedSlice, { maxOutputLength: MAX_DECOMPRESSED_BYTES });
        } catch (err) {
          if (err && (err.code === 'ERR_BUFFER_TOO_LARGE' || /maxOutputLength/i.test(err.message))) {
            throw new DmarcReportError('REPORT_TOO_LARGE', 'That report is too large.');
          }
          throw new DmarcReportError('REPORT_UNREADABLE', 'This report could not be read.');
        }
      }
      throw new DmarcReportError('REPORT_UNREADABLE', 'This report could not be read.');
    }

    if (compressedSize === 0) {
      break;
    }
    offset = dataEnd;
  }
  throw new DmarcReportError('REPORT_UNREADABLE', 'This report could not be read.');
};

const extractXmlFromArchive = (archiveBase64, format) => {
  if (!archiveBase64 || (typeof archiveBase64 === 'string' && !archiveBase64.trim())) {
    throw new DmarcReportError('REPORT_REQUIRED', 'Paste a DMARC aggregate report first.');
  }
  const buf = Buffer.isBuffer(archiveBase64)
    ? archiveBase64
    : Buffer.from(String(archiveBase64).replace(/^data:[^;]+;base64,/, '').trim(), 'base64');

  if (buf.length === 0) {
    throw new DmarcReportError('REPORT_REQUIRED', 'Paste a DMARC aggregate report first.');
  }
  if (buf.length > MAX_DECOMPRESSED_BYTES) {
    throw new DmarcReportError('REPORT_TOO_LARGE', 'That report is too large.');
  }

  const normalizedFormat = String(format || '').toLowerCase().trim();
  const isGzip = normalizedFormat === 'gzip' || normalizedFormat === 'gz'
    || (!normalizedFormat && buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b);
  const isZip = normalizedFormat === 'zip'
    || (!normalizedFormat && buf.length >= 4 && buf.readUInt32LE(0) === 0x04034b50);

  if (isGzip) {
    if (buf.length < 2 || buf[0] !== 0x1f || buf[1] !== 0x8b) {
      throw new DmarcReportError('REPORT_UNREADABLE', 'This report could not be read.');
    }
    try {
      const uncompressed = zlib.gunzipSync(buf, { maxOutputLength: MAX_DECOMPRESSED_BYTES });
      return uncompressed.toString('utf8');
    } catch (err) {
      if (err && (err.code === 'ERR_BUFFER_TOO_LARGE' || /maxOutputLength/i.test(err.message))) {
        throw new DmarcReportError('REPORT_TOO_LARGE', 'That report is too large.');
      }
      throw new DmarcReportError('REPORT_UNREADABLE', 'This report could not be read.');
    }
  }

  if (isZip) {
    if (buf.length < 4 || buf.readUInt32LE(0) !== 0x04034b50) {
      throw new DmarcReportError('REPORT_UNREADABLE', 'This report could not be read.');
    }
    const uncompressed = extractZipXmlBuffer(buf);
    return uncompressed.toString('utf8');
  }

  throw new DmarcReportError('REPORT_UNREADABLE', 'This report could not be read.');
};

const required = (value, label) => {
  if (!value) {
    throw new DmarcReportError('REPORT_UNREADABLE', 'This report could not be read.');
  }
  if (value.length > MAX_FIELD) {
    throw new DmarcReportError('REPORT_UNREADABLE', `The ${label} in this report could not be read.`);
  }
  return value;
};

const integerOf = (value, max = MAX_COUNT) => {
  const text = String(value || '').trim();
  if (!/^\d+$/.test(text)) {
    throw new DmarcReportError('REPORT_UNREADABLE', 'This report could not be read.');
  }
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number > max) {
    throw new DmarcReportError('REPORT_UNREADABLE', 'This report could not be read.');
  }
  return number;
};

const utcDate = (value) => {
  const seconds = integerOf(value, 10_000_000_000);
  return new Date(seconds * 1000).toISOString().slice(0, 10);
};

const verdictFor = (messages, aligned) => {
  if (messages === 0) return 'Quiet';
  if (aligned === messages) return 'Aligned';
  if (aligned === 0) return 'Failing';
  return 'Mixed';
};

const summaryFor = ({ domain, policy, totals, verdict }) => {
  if (verdict === 'Quiet') {
    return `${domain} has an empty report. No messages were counted. Published policy is ${policy}.`;
  }
  return `${totals.aligned} of ${totals.messages} messages aligned for ${domain}. ${totals.failed} did not. Published policy is ${policy}.`;
};

const optionalField = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed || trimmed.length > MAX_FIELD) {
    return null;
  }
  return trimmed;
};

const parseAuthResults = (recordNode) => {
  const authNode = child(recordNode, 'auth_results');
  if (!authNode) {
    return { dkim: [], spf: [] };
  }
  const dkim = children(authNode, 'dkim').map((node) => ({
    domain: optionalField(textOf(node, 'domain'))?.toLowerCase() || null,
    selector: optionalField(textOf(node, 'selector')) || null,
    result: optionalField(textOf(node, 'result'))?.toLowerCase() || 'none',
  })).filter((item) => item.domain || item.result);

  const spf = children(authNode, 'spf').map((node) => ({
    domain: optionalField(textOf(node, 'domain'))?.toLowerCase() || null,
    scope: optionalField(textOf(node, 'scope'))?.toLowerCase() || 'mfrom',
    result: optionalField(textOf(node, 'result'))?.toLowerCase() || 'none',
  })).filter((item) => item.domain || item.result);

  return { dkim, spf };
};

const sourceFromRow = (row, identifiers, authResults) => {
  const evaluated = child(row, 'policy_evaluated');
  if (!evaluated) {
    throw new DmarcReportError('REPORT_UNREADABLE', 'This report could not be read.');
  }
  const dkim = required(textOf(evaluated, 'dkim').toLowerCase(), 'DKIM result');
  const spf = required(textOf(evaluated, 'spf').toLowerCase(), 'SPF result');
  const disposition = required(textOf(evaluated, 'disposition').toLowerCase(), 'disposition');
  const count = integerOf(textOf(row, 'count'));
  const overrideReasons = children(evaluated, 'reason').map((reasonNode) => ({
    type: optionalField(textOf(reasonNode, 'type'))?.toLowerCase() || 'other',
    comment: optionalField(textOf(reasonNode, 'comment')) || null,
  }));

  return {
    sourceIp: required(textOf(row, 'source_ip'), 'source IP'),
    ptrHost: null,
    provider: null,
    headerFrom: identifiers.headerFrom,
    envelopeFrom: identifiers.envelopeFrom,
    envelopeTo: identifiers.envelopeTo,
    count,
    disposition,
    dkim,
    spf,
    aligned: dkim === 'pass' || spf === 'pass',
    authResults,
    overrideReasons,
  };
};

const buildRecommendations = ({ domain, policy, percent, totals, breakdown, sources }) => {
  const recs = [];
  if (totals.messages === 0) {
    recs.push({
      id: 'no_volume',
      severity: 'low',
      title: 'No mail volume recorded in this window',
      detail: `No messages claiming @${domain} were seen by this reporter during the reporting period.`,
    });
    return recs;
  }
  const failingSources = sources.filter((s) => !s.aligned);
  if (failingSources.length > 0) {
    const topIp = failingSources[0].sourceIp;
    recs.push({
      id: 'investigate_unaligned',
      severity: 'high',
      title: `Investigate ${failingSources.length} unaligned sending source${failingSources.length === 1 ? '' : 's'}`,
      detail: `${totals.failed} message${totals.failed === 1 ? '' : 's'} failed both SPF and DKIM alignment (top IP: ${topIp}). Verify whether this IP is a legitimate third-party sender that needs custom DKIM/Return-Path alignment or an unauthorized spoofer.`,
    });
  }
  if (policy === 'none' && totals.failed === 0 && totals.messages > 0) {
    recs.push({
      id: 'step_up_quarantine',
      severity: 'medium',
      title: 'Ready to step up from p=none to p=quarantine',
      detail: `100% of ${totals.messages} message${totals.messages === 1 ? '' : 's'} aligned. Consider moving _dmarc.${domain} from p=none to p=quarantine (and eventually p=reject) to enforce protection.`,
    });
  } else if (policy === 'quarantine' && totals.failed === 0 && percent === 100) {
    recs.push({
      id: 'graduate_reject',
      severity: 'low',
      title: 'Consider graduating to p=reject',
      detail: `All ${totals.messages} messages aligned under p=quarantine. Moving to p=reject instructs receivers to block spoofed messages outright.`,
    });
  }
  if (percent < 100) {
    recs.push({
      id: 'increase_pct',
      severity: 'medium',
      title: `DMARC sampling is set to pct=${percent}%`,
      detail: `Only ${percent}% of unaligned messages are subject to the ${policy} policy. Increase pct=100 for full enforcement.`,
    });
  }
  if (breakdown.dkimAligned === 0 && breakdown.spfAligned > 0) {
    recs.push({
      id: 'add_dkim',
      severity: 'medium',
      title: 'Messages rely solely on SPF alignment',
      detail: 'No messages passed aligned DKIM.SPF breaks when emails are forwarded; add a DKIM signature with d=' + domain + ' to survive forwarding.',
    });
  }
  return recs;
};

const readReport = async (input, options = {}) => {
  let xml = input;
  if (input && typeof input === 'object' && !Buffer.isBuffer(input)) {
    if (input.archiveBase64) {
      xml = extractXmlFromArchive(input.archiveBase64, input.format);
    } else {
      xml = input.xml;
    }
  }

  if (typeof xml !== 'string' || !xml.trim()) {
    throw new DmarcReportError('REPORT_REQUIRED', 'Paste a DMARC aggregate report first.');
  }
  if (xml.length > MAX_XML_CHARS) {
    throw new DmarcReportError('REPORT_TOO_LARGE', 'That report is too large.');
  }

  const document = parseXml(xml.replace(/^\uFEFF/, ''));
  const feedback = document.children.find((node) => node.name === 'feedback');
  if (!feedback) {
    throw new DmarcReportError('REPORT_NOT_FEEDBACK', 'That is not a DMARC aggregate report.');
  }

  const metadata = child(feedback, 'report_metadata');
  const published = child(feedback, 'policy_published');
  if (!metadata || !published) {
    throw new DmarcReportError('REPORT_UNREADABLE', 'This report could not be read.');
  }

  const range = child(metadata, 'date_range');
  if (!range) {
    throw new DmarcReportError('REPORT_UNREADABLE', 'This report could not be read.');
  }
  const beginSec = integerOf(textOf(range, 'begin'), 10_000_000_000);
  const endSec = integerOf(textOf(range, 'end'), 10_000_000_000);
  const begin = utcDate(textOf(range, 'begin'));
  const end = utcDate(textOf(range, 'end'));
  if (begin > end) {
    throw new DmarcReportError('REPORT_UNREADABLE', 'This report could not be read.');
  }
  const windowDays = Math.max(1, Math.round((endSec - beginSec) / 86400));

  const sources = [];
  children(feedback, 'record').forEach((record) => {
    const idNode = child(record, 'identifiers') || { children: [] };
    const headerFrom = textOf(idNode, 'header_from');
    if (headerFrom.length > MAX_FIELD) {
      throw new DmarcReportError('REPORT_UNREADABLE', 'This report could not be read.');
    }
    const identifiers = {
      headerFrom,
      envelopeFrom: optionalField(textOf(idNode, 'envelope_from')),
      envelopeTo: optionalField(textOf(idNode, 'envelope_to')),
    };
    const authResults = parseAuthResults(record);
    children(record, 'row').forEach((row) => {
      sources.push(sourceFromRow(row, identifiers, authResults));
    });
  });

  if (sources.length > MAX_SOURCES) {
    throw new DmarcReportError('REPORT_TOO_LARGE', 'That report is too large.');
  }

  const uniqueIps = [...new Set(sources.map((s) => s.sourceIp))];
  const ptrEntries = await Promise.all(
    uniqueIps.map(async (ip) => [ip, await resolvePtrHost(ip, options.dns)])
  );
  const ptrByIp = new Map(ptrEntries);

  sources.forEach((source) => {
    const ptrHost = ptrByIp.get(source.sourceIp) || null;
    source.ptrHost = ptrHost;
    source.provider = classifyProvider({
      ptrHost,
      envelopeFrom: source.envelopeFrom,
      authResults: source.authResults,
    });
  });

  sources.sort((a, b) => b.count - a.count || a.sourceIp.localeCompare(b.sourceIp));

  const messages = sources.reduce((sum, source) => sum + source.count, 0);
  if (!Number.isSafeInteger(messages)) {
    throw new DmarcReportError('REPORT_TOO_LARGE', 'That report is too large.');
  }
  sources.forEach((source) => {
    source.sharePercent = messages === 0 ? 0 : Math.round((source.count / messages) * 100);
  });

  const aligned = sources.reduce((sum, source) => sum + (source.aligned ? source.count : 0), 0);
  const dkimAligned = sources.reduce((sum, source) => sum + (source.dkim === 'pass' ? source.count : 0), 0);
  const spfAligned = sources.reduce((sum, source) => sum + (source.spf === 'pass' ? source.count : 0), 0);
  const fullyAligned = sources.reduce(
    (sum, source) => sum + (source.dkim === 'pass' && source.spf === 'pass' ? source.count : 0),
    0
  );
  const dispositions = {
    none: sources.reduce((sum, s) => sum + (s.disposition === 'none' ? s.count : 0), 0),
    quarantine: sources.reduce((sum, s) => sum + (s.disposition === 'quarantine' ? s.count : 0), 0),
    reject: sources.reduce((sum, s) => sum + (s.disposition === 'reject' ? s.count : 0), 0),
  };

  const totals = { messages, aligned, failed: messages - aligned };
  const breakdown = {
    dkimAligned,
    spfAligned,
    fullyAligned,
    dispositions,
  };
  const policy = required(textOf(published, 'p').toLowerCase(), 'policy');
  const rawPercent = textOf(published, 'pct');
  const percent = rawPercent === '' ? 100 : integerOf(rawPercent);
  if (percent > 100) {
    throw new DmarcReportError('REPORT_UNREADABLE', 'This report could not be read.');
  }
  const adkim = (optionalField(textOf(published, 'adkim')) || 'r').toLowerCase();
  const aspf = (optionalField(textOf(published, 'aspf')) || 'r').toLowerCase();
  const failureOptions = optionalField(textOf(published, 'fo'));
  const report = {
    stored: false,
    orgName: required(textOf(metadata, 'org_name'), 'reporter'),
    reportId: required(textOf(metadata, 'report_id'), 'report id'),
    domain: required(textOf(published, 'domain').toLowerCase(), 'domain'),
    policy,
    subdomainPolicy: textOf(published, 'sp').toLowerCase() || null,
    adkim,
    aspf,
    failureOptions,
    percent,
    begin,
    end,
    windowDays,
    verdict: verdictFor(messages, aligned),
    totals,
    breakdown,
    alignedPercent: messages === 0 ? 0 : Math.round((aligned / messages) * 100),
    sources,
  };
  report.summary = summaryFor(report);
  report.recommendations = buildRecommendations(report);
  return report;
};

module.exports = {
  readReport,
  extractXmlFromArchive,
  classifyProvider,
  DmarcReportError,
  MAX_XML_CHARS,
  MAX_DECOMPRESSED_BYTES,
};
