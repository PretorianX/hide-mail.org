/**
 * Deterministic Sisimai-grade ISP diagnostic pattern matcher.
 * Classifies generic status codes (e.g. 5.0.0, 5.5.0, 4.0.0) and identifies the receiving ISP/filter
 * by inspecting cleanDiagnostic, remoteMta, and reportingMta.
 */

const REASON_PATTERNS = [
  {
    reasonCode: 'blocklist',
    patterns: [
      /spamhaus/i,
      /barracuda/i,
      /spamcop/i,
      /sorbs/i,
      /proofpoint\s+rbl/i,
      /pdr\.b\.proofpoint/i,
      /blocked\s+using/i,
      /blacklisted/i,
      /ip\s+reputation/i,
    ],
  },
  {
    reasonCode: 'policy_dmarc',
    patterns: [
      /dmarc\s+policy/i,
      /dmarc=fail/i,
      /\b5\.7\.26\b/,
      /unauthenticated\s+email\s+from/i,
      /is\s+not\s+accepted\s+due\s+to\s+domain's\s+dmarc/i,
    ],
  },
  {
    reasonCode: 'policy_spf',
    patterns: [
      /spf\s+validation/i,
      /\b5\.7\.23\b/,
      /not\s+authorized\s+to\s+send\s+on\s+behalf/i,
      /spf=fail/i,
    ],
  },
  {
    reasonCode: 'rate_limit',
    patterns: [
      /rate\s+limit/i,
      /too\s+many\s+connections/i,
      /try\s+again\s+later/i,
      /421\s+4\.7\.0/i,
      /throttled/i,
      /receiving\s+at\s+a\s+rate/i,
    ],
  },
  {
    reasonCode: 'quota_exceeded',
    patterns: [
      /over\s+quota/i,
      /mailbox\s+full/i,
      /quota\s+exceeded/i,
      /storage\s+allocation/i,
    ],
  },
  {
    reasonCode: 'bad_mailbox',
    patterns: [
      /user\s+unknown/i,
      /no\s+such\s+user/i,
      /does\s+not\s+exist/i,
      /invalid\s+recipient/i,
      /recipient\s+address\s+rejected/i,
    ],
  },
  {
    reasonCode: 'spam_content',
    patterns: [
      /message\s+rejected\s+as\s+spam/i,
      /high\s+spam\s+probability/i,
      /unsolicited\s+mail/i,
      /spam\s+content/i,
    ],
  },
];

const ISP_HINTS = [
  {
    ispHint: 'Gmail',
    patterns: [/google\.com/i, /gmail-smtp-in/i, /googlemail\.com/i, /gsmtp/i],
  },
  {
    ispHint: 'Microsoft 365 / Outlook',
    patterns: [/outlook\.com/i, /protection\.outlook\.com/i, /hotmail\.com/i, /office365\.com/i],
  },
  {
    ispHint: 'Yahoo / AOL',
    patterns: [/yahoodns\.net/i, /yahoo\.com/i, /aol\.com/i, /\[tss04\]/i],
  },
  {
    ispHint: 'Proofpoint',
    patterns: [/pphosted\.com/i, /proofpoint/i],
  },
  {
    ispHint: 'Mimecast',
    patterns: [/mimecast\.com/i, /mimecast/i],
  },
  {
    ispHint: 'Barracuda',
    patterns: [/barracudanetworks\.com/i, /barracuda/i],
  },
  {
    ispHint: 'Amazon SES',
    patterns: [/amazonaws\.com/i, /amazonses\.com/i],
  },
];

const REASON_EXPLANATIONS = {
  blocklist: {
    title: 'Blocked by IP or domain blocklist',
    detail: 'The receiving server rejected the message because the sending IP or domain is listed on a DNSBL or reputation blocklist.',
    category: 'Security or Policy Status',
    remediation: 'Run Mail Grade to inspect DNSBL listings for your sending IP and domain, resolve the root cause, and submit a delisting request before retrying.',
  },
  policy_dmarc: {
    title: 'DMARC policy rejection',
    detail: 'The receiving domain rejected the message because it failed DMARC authentication or alignment.',
    category: 'Security or Policy Status',
    remediation: 'Verify SPF and DKIM alignment with your From header domain using Sender Check before sending again.',
  },
  policy_spf: {
    title: 'SPF authentication failure',
    detail: 'The sending host is not authorized by the domain\'s SPF record to send mail on its behalf.',
    category: 'Security or Policy Status',
    remediation: 'Add the sending server IP or provider include mechanism to your domain\'s SPF TXT record and verify with Sender Check.',
  },
  rate_limit: {
    title: 'Rate limited or throttled by receiver',
    detail: 'The receiving server temporarily deferred the message due to connection or volume rate limits.',
    category: 'Security or Policy Status',
    remediation: 'Reduce concurrent connections and hourly sending velocity to this ISP, and allow exponential backoff to retry.',
  },
  quota_exceeded: {
    title: 'Mailbox quota exceeded',
    detail: 'The recipient mailbox is full or has exceeded its storage allocation.',
    category: 'Mailbox Status',
    remediation: 'Pause deliveries to this recipient for 24–48 hours while the mailbox clears space, or suppress if the failure is permanent.',
  },
  bad_mailbox: {
    title: 'No such mailbox',
    detail: 'The destination mailbox does not exist or was rejected as an invalid recipient. Do not retry it.',
    category: 'Addressing Status',
    remediation: 'Suppress this address immediately in your mailing list or CRM. Continuing to send to invalid addresses harms domain reputation.',
  },
  spam_content: {
    title: 'Rejected as spam content',
    detail: 'The receiving filter rejected the message due to high spam probability or content policy.',
    category: 'Security or Policy Status',
    remediation: 'Audit your message headers, links, and content with Mail Grade and ensure valid List-Unsubscribe headers are present.',
  },
};

const GENERIC_STATUSES = new Set(['5.0.0', '5.5.0', '4.0.0']);

const matchDiagnostic = ({ cleanDiagnostic = '', remoteMta = '', reportingMta = '' } = {}) => {
  const diagText = String(cleanDiagnostic || '');
  const mtaText = `${remoteMta || ''} ${reportingMta || ''}`;
  const combined = `${diagText} ${mtaText}`;

  let reasonCode = 'general';
  for (const entry of REASON_PATTERNS) {
    // Match diagnostic text first; avoid triggering 'blocklist' solely because remoteMta is barracudanetworks.com
    const target = entry.reasonCode === 'blocklist' ? diagText : combined;
    if (entry.patterns.some((regex) => regex.test(target))) {
      reasonCode = entry.reasonCode;
      break;
    }
  }

  let ispHint = null;
  for (const entry of ISP_HINTS) {
    if (entry.patterns.some((regex) => regex.test(combined))) {
      ispHint = entry.ispHint;
      break;
    }
  }

  return {
    reasonCode,
    ispHint,
    override: reasonCode !== 'general' ? REASON_EXPLANATIONS[reasonCode] || null : null,
  };
};

const isGenericStatus = (status) => GENERIC_STATUSES.has(String(status || '').trim());

module.exports = {
  matchDiagnostic,
  isGenericStatus,
  REASON_EXPLANATIONS,
};
