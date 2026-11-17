const {
  findAuthoritativeNameservers,
  queryAuthoritative,
} = require('./dnsAuthoritative');
const { buildExpectedRecords } = require('./domainRecords');

const stripWhitespace = (value) => String(value || '').replace(/\s+/g, '');

// DKIM comparison ignores whitespace and TXT string-splitting artifacts, then
// compares only the p= public-key value (spec 5.3 point 2).
const extractDkimPublicKey = (record) => {
  const match = stripWhitespace(record).match(/p=([^;]*)/i);
  return match ? match[1] : null;
};

const dkimMatches = (record, expected) => {
  const actual = extractDkimPublicKey(record);
  const target = extractDkimPublicKey(expected);
  return Boolean(actual) && Boolean(target) && actual === target;
};

// DMARC has no single "expected" value: this only checks that exactly one
// syntactically valid v=DMARC1;... record is published (minimal shape check,
// mirrors senderCheck/records.js's interpretDmarc without importing it).
const isValidDmarcRecord = (record) => {
  const normalized = stripWhitespace(record).toLowerCase();
  if (!normalized.startsWith('v=dmarc1;')) return false;
  return /(?:^|;)p=(none|quarantine|reject)(?:;|$)/.test(normalized);
};

const cnameMatches = (record, expected) => {
  const normalize = (value) => String(value || '').trim().replace(/\.$/, '').toLowerCase();
  return normalize(record) === normalize(expected);
};

// A TXT query that only turns up a single bare hostname (no key=value tags)
// indicates the zone delegated this name via CNAME instead of publishing TXT.
const looksLikeCnameRedirect = (record) => {
  const value = String(record || '').trim();
  if (!value || value.includes('=')) return false;
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+\.?$/i.test(value);
};

// Classifies one answered nameserver's records against one expected record.
// Returns whether it matched and, if not, the most specific failure reason.
const classifyAnswer = (recordDef, records) => {
  if (records.length === 0) {
    return { matched: false, reason: 'missing' };
  }
  if (recordDef.type === 'TXT' && records.length > 1) {
    return { matched: false, reason: 'multiple_records' };
  }

  const [value] = records;

  if (recordDef.type === 'TXT' && looksLikeCnameRedirect(value)) {
    return { matched: false, reason: 'cname_where_txt_expected' };
  }

  if (recordDef.id === 'dkim') {
    return { matched: dkimMatches(value, recordDef.expected), reason: 'mismatch' };
  }
  if (recordDef.id === 'dmarc') {
    return { matched: isValidDmarcRecord(value), reason: 'mismatch' };
  }
  return { matched: cnameMatches(value, recordDef.expected), reason: 'mismatch' };
};

// Priority order for picking the single most specific reason across every
// answered nameserver, per spec 5.3 point 2.
const REASON_PRIORITY = ['missing', 'multiple_records', 'cname_where_txt_expected', 'mismatch'];

const mostSpecificReason = (reasons) => (
  REASON_PRIORITY.find((candidate) => reasons.includes(candidate)) || null
);

const verifyRecord = async (recordDef) => {
  const nameservers = await findAuthoritativeNameservers(recordDef.host);
  const { answered } = await queryAuthoritative({
    name: recordDef.host,
    type: recordDef.type,
    nameservers,
  });

  if (answered.length === 0) {
    return {
      id: recordDef.id,
      status: 'fail',
      reason: 'no_answer',
      nameserverAnswers: [],
    };
  }

  const failReasons = [];
  const nameserverAnswers = answered.map((entry) => {
    const { matched, reason } = classifyAnswer(recordDef, entry.records);
    if (!matched) failReasons.push(reason);
    return {
      nameserver: entry.nameserver,
      value: entry.records.length === 1 ? entry.records[0] : entry.records,
      matched,
    };
  });

  if (failReasons.length === 0) {
    return { id: recordDef.id, status: 'pass', reason: null, nameserverAnswers };
  }

  return {
    id: recordDef.id,
    status: 'fail',
    reason: mostSpecificReason(failReasons),
    nameserverAnswers,
  };
};

// State transition rule (spec 5.3 point 2):
// - all three records pass -> verified
// - was verified, and at least one record has a real (non no_answer) fail -> broken
// - was verified, and remaining fails are all no_answer -> stays verified
// - otherwise -> pending
const determineState = (records, previousState) => {
  if (records.every((record) => record.status === 'pass')) {
    return 'verified';
  }
  if (previousState === 'verified') {
    const hasRealFail = records.some((record) => (
      record.status === 'fail' && record.reason !== 'no_answer'
    ));
    return hasRealFail ? 'broken' : 'verified';
  }
  return 'pending';
};

const verifyDomain = async ({ domain, selector, publicKeyPem, previousState }) => {
  const expectedRecords = buildExpectedRecords({ domain, selector, publicKeyPem });
  const records = await Promise.all(expectedRecords.map(verifyRecord));

  return {
    state: determineState(records, previousState),
    records,
  };
};

module.exports = {
  verifyDomain,
};
