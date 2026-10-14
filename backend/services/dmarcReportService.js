/**
 * Read a DMARC aggregate report (RFC 7489) into a source-by-source summary.
 * The XML is scored in memory and is not stored.
 */

const { DmarcReportError } = require('./dmarcReport/errors');
const { parseXml, child, children, textOf } = require('./dmarcReport/parseXml');

const MAX_XML_CHARS = 512 * 1024;
const MAX_SOURCES = 2000;
const MAX_FIELD = 300;
const MAX_COUNT = 1_000_000_000;

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

const sourceFromRow = (row, headerFrom) => {
  const evaluated = child(row, 'policy_evaluated');
  if (!evaluated) {
    throw new DmarcReportError('REPORT_UNREADABLE', 'This report could not be read.');
  }
  const dkim = required(textOf(evaluated, 'dkim').toLowerCase(), 'DKIM result');
  const spf = required(textOf(evaluated, 'spf').toLowerCase(), 'SPF result');
  const disposition = required(textOf(evaluated, 'disposition').toLowerCase(), 'disposition');
  const count = integerOf(textOf(row, 'count'));
  return {
    sourceIp: required(textOf(row, 'source_ip'), 'source IP'),
    headerFrom,
    count,
    disposition,
    dkim,
    spf,
    aligned: dkim === 'pass' || spf === 'pass',
  };
};

const readReport = async (xml) => {
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
  const begin = utcDate(textOf(range, 'begin'));
  const end = utcDate(textOf(range, 'end'));
  if (begin > end) {
    throw new DmarcReportError('REPORT_UNREADABLE', 'This report could not be read.');
  }

  const sources = [];
  children(feedback, 'record').forEach((record) => {
    const headerFrom = textOf(child(record, 'identifiers') || { children: [] }, 'header_from');
    if (headerFrom.length > MAX_FIELD) {
      throw new DmarcReportError('REPORT_UNREADABLE', 'This report could not be read.');
    }
    children(record, 'row').forEach((row) => {
      sources.push(sourceFromRow(row, headerFrom));
    });
  });

  if (sources.length > MAX_SOURCES) {
    throw new DmarcReportError('REPORT_TOO_LARGE', 'That report is too large.');
  }

  sources.sort((a, b) => b.count - a.count || a.sourceIp.localeCompare(b.sourceIp));

  const messages = sources.reduce((sum, source) => sum + source.count, 0);
  if (!Number.isSafeInteger(messages)) {
    throw new DmarcReportError('REPORT_TOO_LARGE', 'That report is too large.');
  }
  const aligned = sources.reduce((sum, source) => sum + (source.aligned ? source.count : 0), 0);
  const totals = { messages, aligned, failed: messages - aligned };
  const policy = required(textOf(published, 'p').toLowerCase(), 'policy');
  const report = {
    stored: false,
    orgName: required(textOf(metadata, 'org_name'), 'reporter'),
    reportId: required(textOf(metadata, 'report_id'), 'report id'),
    domain: required(textOf(published, 'domain').toLowerCase(), 'domain'),
    policy,
    subdomainPolicy: textOf(published, 'sp').toLowerCase() || null,
    percent: integerOf(required(textOf(published, 'pct'), 'percent')),
    begin,
    end,
    verdict: verdictFor(messages, aligned),
    totals,
    alignedPercent: messages === 0 ? 0 : Math.round((aligned / messages) * 100),
    sources,
  };
  report.summary = summaryFor(report);
  return report;
};

module.exports = {
  readReport,
  DmarcReportError,
  MAX_XML_CHARS,
};
