/**
 * RFC 3463 enhanced status codes that show up in real delivery failures.
 * An unlisted code still has a class: the first digit is the standard
 * (2 delivered, 4 temporary, 5 permanent). The words below only name the
 * common codes; they do not guess a bounce from prose.
 */

const EXACT = {
  '5.1.1': {
    title: 'No such mailbox',
    detail: 'The destination mailbox does not exist. Do not retry it.',
  },
  '5.1.2': {
    title: 'Bad destination domain',
    detail: 'The destination domain is not a valid mail host. Do not retry it.',
  },
  '5.1.3': {
    title: 'Bad recipient address',
    detail: 'The recipient address is syntactically invalid. Do not retry it.',
  },
  '5.1.10': {
    title: 'Recipient address rejected',
    detail: 'The receiving server rejected this recipient address. Do not retry it.',
  },
  '5.2.1': {
    title: 'Mailbox disabled',
    detail: 'The mailbox is disabled and is not accepting mail. Do not retry it.',
  },
  '5.2.2': {
    title: 'Mailbox full',
    detail: 'The mailbox is over quota and the failure is permanent. Do not retry it.',
  },
  '5.2.3': {
    title: 'Message too large',
    detail: 'The message is larger than the mailbox allows. Do not retry the same message.',
  },
  '5.3.0': {
    title: 'Mail system refused the message',
    detail: 'The destination mail system refused the message permanently.',
  },
  '5.4.1': {
    title: 'No answer from the next server',
    detail: 'The next mail server did not answer, and the sender gave up. Do not retry it.',
  },
  '5.4.4': {
    title: 'Unable to route',
    detail: 'No route exists to the destination domain. Do not retry it.',
  },
  '5.5.0': {
    title: 'Protocol failure',
    detail: 'The servers could not complete the SMTP conversation. Do not retry it as-is.',
  },
  '5.6.0': {
    title: 'Media not supported',
    detail: 'The destination cannot handle this message format. Do not retry the same message.',
  },
  '5.7.1': {
    title: 'Delivery not authorized',
    detail: 'A policy blocked delivery. Do not retry until the policy changes.',
  },
  '5.7.26': {
    title: 'Sender authentication required',
    detail: 'The receiver required authenticated mail and rejected this one. Do not retry it as-is.',
  },
  '4.2.1': {
    title: 'Mailbox busy',
    detail: 'The mailbox is temporarily busy. A later retry can succeed.',
  },
  '4.2.2': {
    title: 'Mailbox full',
    detail: 'The mailbox is over quota for now. A later retry can succeed.',
  },
  '4.3.2': {
    title: 'Mail system congested',
    detail: 'The destination system is congested. A later retry can succeed.',
  },
  '4.4.1': {
    title: 'Connection timed out',
    detail: 'The connection to the next server timed out. A later retry can succeed.',
  },
  '4.4.2': {
    title: 'Connection dropped',
    detail: 'The connection closed before delivery finished. A later retry can succeed.',
  },
  '4.4.7': {
    title: 'Delivery time expired',
    detail: 'The message waited too long in a queue. Check the status before retrying.',
  },
  '4.7.0': {
    title: 'Temporarily refused by policy',
    detail: 'A policy refused the message for now. A later retry can succeed.',
  },
  '4.7.1': {
    title: 'Temporarily refused by policy',
    detail: 'A policy refused the message for now. A later retry can succeed.',
  },
  '2.0.0': {
    title: 'Delivered',
    detail: 'The message was delivered.',
  },
  '2.1.5': {
    title: 'Delivered',
    detail: 'The destination accepted the message.',
  },
};

const CLASS_COPY = {
  hard: {
    title: 'Permanent failure',
    detail: (status) => `Status ${status} is a permanent failure.`,
  },
  soft: {
    title: 'Temporary failure',
    detail: (status) => `Status ${status} is a temporary failure.`,
  },
  delayed: {
    title: 'Delivery delayed',
    detail: (status) => `Status ${status} says delivery is still being attempted.`,
  },
  delivered: {
    title: 'Delivered',
    detail: (status) => `Status ${status} says the message was delivered.`,
  },
  relayed: {
    title: 'Relayed',
    detail: (status) => `Status ${status} says the message was relayed onward.`,
  },
  expanded: {
    title: 'Expanded',
    detail: (status) => `Status ${status} says the address was expanded to a list.`,
  },
};

const classify = (status, action) => {
  const kind = status[0];
  const act = String(action || '').trim().toLowerCase();
  if (kind === '5') {
    return { class: 'hard', retry: false };
  }
  if (kind === '4') {
    if (act === 'delayed') {
      return { class: 'delayed', retry: true };
    }
    return { class: 'soft', retry: true };
  }
  if (act === 'relayed') {
    return { class: 'relayed', retry: false };
  }
  if (act === 'expanded') {
    return { class: 'expanded', retry: false };
  }
  return { class: 'delivered', retry: false };
};

const SUBJECT_CATEGORY = {
  0: 'Other or Undefined Status',
  1: 'Addressing Status',
  2: 'Mailbox Status',
  3: 'Mail System Status',
  4: 'Network & Routing Status',
  5: 'Mail Delivery Protocol Status',
  6: 'Message Content or Media Status',
  7: 'Security or Policy Status',
};

const categoryOf = (status) => {
  const parts = String(status || '').split('.');
  const subject = Number(parts[1]);
  return SUBJECT_CATEGORY[subject] || 'Other or Undefined Status';
};

const remediationFor = (status, outcome) => {
  const parts = String(status || '').split('.');
  const subject = Number(parts[1]);
  if (outcome.class === 'hard') {
    if (subject === 7) {
      return 'Do not retry immediately. Inspect SPF, DKIM, DMARC alignment (Sender Check) and IP/domain blocklists (Mail Grade) to resolve the policy rejection.';
    }
    if (status === '5.2.3' || subject === 6) {
      return 'Reduce attachment size or fix MIME formatting before sending a new message to this recipient.';
    }
    return 'Suppress this address immediately in your mailing list or CRM. Continuing to send to hard-bouncing addresses harms domain reputation.';
  }
  if (outcome.class === 'soft' || outcome.class === 'delayed') {
    if (subject === 2) {
      return 'Pause deliveries to this recipient for 24–48 hours while the mailbox clears quota or temporary lock, then retry.';
    }
    if (subject === 7) {
      return 'Throttle sending rate to this receiving domain and verify authentication headers before the next retry window.';
    }
    return 'Allow standard MTA exponential backoff (retry over 24–72 hours). Suppress only if soft bounces persist across 3+ consecutive campaigns.';
  }
  return 'No suppression needed; the message was accepted or relayed onward.';
};

const explainStatus = (status, action) => {
  const outcome = classify(status, action);
  const known = EXACT[status];
  const generic = CLASS_COPY[outcome.class];
  return {
    class: outcome.class,
    retry: outcome.retry,
    title: known ? known.title : generic.title,
    detail: known ? known.detail : generic.detail(status),
    category: categoryOf(status),
    remediation: remediationFor(status, outcome),
  };
};

module.exports = {
  explainStatus,
  classify,
};
