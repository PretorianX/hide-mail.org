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

// This heuristic rarely fires on real DNS: a true CNAME-only answer to a TXT
// query is normalized away by Task 3's queryAuthoritative before it ever
// reaches here (ENODATA/ENOTFOUND collapse to an empty records array, which
// classifyAnswer already reports as 'missing'). It exists only to label the
// narrow case where that normalization doesn't apply and a bare hostname-
// shaped value still comes through as the sole TXT answer. A real
// CNAME-at-TXT-host misconfiguration will typically surface as 'missing'
// instead, which is still a correct fail either way.
//
// A TXT query that only turns up a single bare hostname (no key=value tags)
// indicates the zone delegated this name via CNAME instead of publishing TXT.
const looksLikeCnameRedirect = (record) => {
  const value = String(record || '').trim();
  if (!value || value.includes('=')) return false;
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+\.?$/i.test(value);
};

// Whether a single TXT value carries this record type's own signature.
// Used to ignore unrelated TXT records (e.g. SPF) sitting next to the real
// DKIM/DMARC record when there is more than one raw TXT value at a host.
const startsWithCaseInsensitive = (value, prefix) => (
  String(value || '').trim().toLowerCase().startsWith(prefix.toLowerCase())
);

const isApplicableRecord = (recordDef, value) => {
  if (recordDef.id === 'dkim') {
    return startsWithCaseInsensitive(value, 'v=DKIM1') || /(?:^|;)\s*p\s*=/i.test(value);
  }
  if (recordDef.id === 'dmarc') {
    return startsWithCaseInsensitive(value, 'v=DMARC1');
  }
  return true;
};

// Classifies one answered nameserver's records against one expected record.
// Returns whether it matched and, if not, the most specific failure reason.
const classifyAnswer = (recordDef, records) => {
  if (records.length === 0) {
    return { matched: false, reason: 'missing' };
  }

  // Only scope down to "applicable" records when there is more than one raw
  // TXT value at this host: an unrelated TXT record should not count towards
  // multiple_records. A single raw value is always evaluated as-is below
  // (including by looksLikeCnameRedirect), so it is never filtered away here.
  let candidates = records;
  if (recordDef.type === 'TXT' && records.length > 1) {
    candidates = records.filter((value) => isApplicableRecord(recordDef, value));
    if (candidates.length === 0) {
      return { matched: false, reason: 'missing' };
    }
    if (candidates.length > 1) {
      return { matched: false, reason: 'multiple_records' };
    }
  }

  const [value] = candidates;

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
      value: entry.records,
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

// State transition rule (spec 5.3 point 2, with the controller's sticky-broken
// ruling superseding the brief's literal transition table):
// - all three records pass -> verified
// - was verified, and at least one record has a real (non no_answer) fail -> broken
// - was broken, and not all pass -> stays broken (sticky: no_answer or real
//   fail, it doesn't matter; the ONLY way out of broken is all-pass)
// - was verified, and remaining fails are all no_answer -> stays verified
// - otherwise (previousState is pending or anything else) -> pending
const determineState = (records, previousState) => {
  if (records.every((record) => record.status === 'pass')) {
    return 'verified';
  }
  if (previousState === 'broken') {
    return 'broken';
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
