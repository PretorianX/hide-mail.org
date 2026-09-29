/**
 * Quality findings for one parsed email. Penalties live with the finding so the
 * score cannot drift from the list a person reads.
 */

const SPAM_PHRASES = [
  'act now',
  'click here',
  'free money',
  'you have won',
  'claim your prize',
  'risk free',
  'limited time',
  'viagra',
];

const PENALTY = {
  fail: 18,
  warn: 7,
};

const headerText = (headers, name) => {
  if (!headers || typeof headers.get !== 'function') {
    return '';
  }
  const value = headers.get(name);
  if (value == null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => headerText({ get: () => item }, name)).join('\n');
  }
  if (typeof value === 'object' && value.value) {
    return String(value.value);
  }
  return String(value);
};

const addressesOf = (field) => {
  if (!field) {
    return [];
  }
  const list = Array.isArray(field.value) ? field.value : [field];
  return list.filter((item) => item && item.address);
};

const domainOf = (address) => {
  const at = String(address).lastIndexOf('@');
  if (at < 0) {
    return '';
  }
  return String(address).slice(at + 1).toLowerCase();
};

const letterCount = (value) => (value.match(/[A-Za-z]/g) || []).length;

const isShouting = (subject) => {
  const letters = letterCount(subject);
  if (letters < 8) {
    return false;
  }
  const upper = (subject.match(/[A-Z]/g) || []).length;
  return upper / letters >= 0.8;
};

const collectLinks = (source, parsed) => {
  const haystack = `${source}\n${parsed.text || ''}\n${parsed.html || ''}`;
  const found = haystack.match(/https?:\/\/[^\s<>"')]+/gi) || [];
  return [...new Set(found.map((link) => link.replace(/[.,;]+$/, '')))];
};

const visibleText = (parsed) => {
  const html = String(parsed.html || '').replace(/<[^>]+>/g, ' ');
  return `${parsed.subject || ''}\n${parsed.text || ''}\n${html}`.toLowerCase();
};

const authVerdicts = (headers) => {
  const auth = headerText(headers, 'authentication-results').toLowerCase();
  if (!auth) {
    return [];
  }
  return ['spf', 'dkim', 'dmarc'].map((kind) => {
    const match = auth.match(new RegExp(`${kind}=(pass|fail|softfail|neutral|none|temperror|permerror)`));
    return match ? { kind, result: match[1] } : null;
  }).filter(Boolean);
};

const push = (findings, severity, id, title, detail) => {
  findings.push({
    id,
    severity,
    title,
    detail,
    penalty: PENALTY[severity] || 0,
  });
};

/**
 * @param {{ parsed: object, source: string }} input
 * @returns {Array<{id: string, severity: string, title: string, detail: string, penalty: number}>}
 */
const buildFindings = ({ parsed, source }) => {
  const findings = [];
  const headers = parsed.headers;
  const from = addressesOf(parsed.from);
  const subject = (parsed.subject || '').trim();
  const links = collectLinks(source, parsed);

  if (from.length === 0) {
    push(findings, 'fail', 'from_missing', 'Missing From', 'The message has no From address.');
  } else {
    push(
      findings,
      'pass',
      'from_present',
      'From is present',
      `From ${from[0].address}.`
    );
    const display = from[0].name || '';
    const disguised = display.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (disguised && disguised[0].toLowerCase() !== from[0].address.toLowerCase()) {
      push(
        findings,
        'warn',
        'from_display_mismatch',
        'Display name hides a different address',
        `The display name contains ${disguised[0]}, which is not ${from[0].address}.`
      );
    }
  }

  if (!subject) {
    push(findings, 'fail', 'subject_missing', 'Missing subject', 'The message has no subject.');
  } else {
    push(findings, 'pass', 'subject_present', 'Subject is present', `Subject is ${subject.length} characters.`);
    if (subject.length < 3 || subject.length > 78) {
      push(
        findings,
        'warn',
        'subject_length',
        'Subject length is awkward',
        'Keep the subject between 3 and 78 characters so it is not clipped or empty.'
      );
    }
    if (isShouting(subject)) {
      push(
        findings,
        'warn',
        'subject_shouting',
        'Subject is shouting',
        'Most of the subject is uppercase.'
      );
    }
    if (/[!?]{2,}/.test(subject) || (subject.match(/!/g) || []).length > 2) {
      push(
        findings,
        'warn',
        'subject_punctuation',
        'Subject overuses punctuation',
        'Repeated exclamation or question marks read as spam.'
      );
    }
  }

  if (parsed.date) {
    push(findings, 'pass', 'date_present', 'Date is present', 'The message has a Date header.');
  } else {
    push(findings, 'warn', 'date_missing', 'Missing Date', 'A Date header tells receiving servers when you sent it.');
  }

  if (parsed.messageId) {
    push(findings, 'pass', 'message_id_present', 'Message-ID is present', parsed.messageId);
  } else {
    push(
      findings,
      'warn',
      'message_id_missing',
      'Missing Message-ID',
      'A Message-ID lets providers thread the message and spot duplicates.'
    );
  }

  const replyTo = addressesOf(parsed.replyTo);
  if (from[0] && replyTo[0]) {
    const fromDomain = domainOf(from[0].address);
    const replyDomain = domainOf(replyTo[0].address);
    if (fromDomain && replyDomain && fromDomain !== replyDomain) {
      push(
        findings,
        'warn',
        'reply_to_mismatch',
        'Reply-To uses another domain',
        `From is @${fromDomain} and Reply-To is @${replyDomain}.`
      );
    } else {
      push(findings, 'pass', 'reply_to_aligned', 'Reply-To matches From', `Both use @${fromDomain}.`);
    }
  }

  // Presence only — live SPF/DKIM/DMARC verdicts come from authChecks.
  const dkimHeader = headerText(headers, 'dkim-signature');
  const verdicts = authVerdicts(headers);
  const dkimVerdict = verdicts.find((item) => item.kind === 'dkim');
  if (dkimHeader || (dkimVerdict && dkimVerdict.result === 'pass')) {
    push(
      findings,
      'pass',
      'dkim_present',
      'DKIM evidence is present',
      dkimHeader ? 'This copy carries a DKIM-Signature header.' : 'Authentication-Results reports dkim=pass.'
    );
  } else {
    push(
      findings,
      'warn',
      'dkim_missing',
      'No DKIM evidence',
      'This copy has neither a DKIM-Signature header nor a dkim=pass result.'
    );
  }

  const hasTextPart = /content-type:\s*text\/plain/i.test(source);
  const hasHtml = Boolean(parsed.html) || /content-type:\s*text\/html/i.test(source);
  if (hasHtml && !hasTextPart) {
    push(
      findings,
      'warn',
      'html_without_text',
      'HTML without a plain-text part',
      'Add a text/plain alternative for clients that do not render HTML.'
    );
  } else if (hasHtml && hasTextPart) {
    push(
      findings,
      'pass',
      'text_alternative',
      'Plain-text alternative is present',
      'The message includes both text/plain and HTML.'
    );
  }

  const bodyEmpty = !String(parsed.text || '').trim() && !String(parsed.html || '').trim();
  if (bodyEmpty) {
    push(findings, 'fail', 'body_empty', 'Empty body', 'The message has no text or HTML body.');
  }

  const insecure = links.filter((link) => link.toLowerCase().startsWith('http://'));
  if (insecure.length > 0) {
    push(
      findings,
      'warn',
      'insecure_links',
      'Link uses HTTP',
      `${insecure.length} link${insecure.length === 1 ? '' : 's'} start with http:// rather than https://.`
    );
  } else if (links.length > 0) {
    push(findings, 'pass', 'links_https', 'Links use HTTPS', `${links.length} link${links.length === 1 ? '' : 's'}, all HTTPS.`);
  }

  const listUnsubscribe = /^list-unsubscribe\s*:/im.test(source)
    || Boolean(headers && headers.get('list') && headers.get('list').unsubscribe);
  const looksBulk = Boolean(headerText(headers, 'list-id')) || links.length >= 3;
  if (listUnsubscribe) {
    push(findings, 'pass', 'list_unsubscribe', 'Unsubscribe header is present', 'List-Unsubscribe is set.');
  } else if (looksBulk) {
    push(
      findings,
      'warn',
      'list_unsubscribe_missing',
      'Bulk mail has no List-Unsubscribe',
      'Messages with several links, or a List-Id, need a List-Unsubscribe header.'
    );
  }

  const phrases = SPAM_PHRASES.filter((phrase) => visibleText(parsed).includes(phrase));
  if (phrases.length > 0) {
    push(
      findings,
      'warn',
      'spam_phrases',
      'Spam-like language',
      `Phrases that hurt trust: ${phrases.join(', ')}.`
    );
  }

  return findings;
};

const scoreOf = (findings) => findings.reduce(
  (score, finding) => score - finding.penalty,
  100
);

const letterFor = (score) => {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 55) return 'D';
  return 'F';
};

const SUMMARY = {
  A: 'This message looks ready to send.',
  B: 'This message is in good shape, with a few things to fix.',
  C: 'This message needs work before you send it.',
  D: 'This message has serious quality problems.',
  F: 'This message is not ready to send.',
};

module.exports = {
  buildFindings,
  scoreOf,
  letterFor,
  SUMMARY,
  PENALTY,
};
