/**
 * Rules for replying from a temporary address.
 *
 * Pure functions only: no Redis, no SMTP, no config. Everything that decides *who* a reply may
 * go to and *what* it may contain lives here so each rule is a unit test rather than an
 * integration test.
 *
 * The load-bearing rule is that the recipient is derived from stored mail, never from the
 * request. A mailbox can only write to an address that has already written to it, which is what
 * keeps a temp-mail service from being an open relay.
 */

// Address extraction. Both character classes exclude '@' so the pattern cannot backtrack.
const ANGLE_ADDRESS = /<([^<>]+)>/;
const BARE_ADDRESS = /[^\s<>,;"@]+@[^\s<>,;"@]+/;
const ADDRESS_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A From header with a display name is longer than an address, but not unboundedly so.
const MAX_HEADER_LENGTH = 1000;

const NO_SUBJECT = '(No Subject)';
const REPLY_PREFIX = /^re\s*:/i;

class ReplyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ReplyError';
    this.code = code;
  }
}

/** Header values that echo stored mail must not be able to start a new header. */
const singleLine = (value) => String(value).replace(/[\r\n]+/g, ' ').trim();

const firstAddress = (headerText) => {
  if (typeof headerText !== 'string' || headerText.length > MAX_HEADER_LENGTH) {
    return null;
  }
  const angled = headerText.match(ANGLE_ADDRESS);
  const candidate = angled ? angled[1] : (headerText.match(BARE_ADDRESS) || [])[0];
  if (!candidate) {
    return null;
  }
  const address = candidate.trim().toLowerCase();
  return ADDRESS_SHAPE.test(address) ? address : null;
};

/**
 * The address a reply to this message should go to: Reply-To when the sender asked for one,
 * otherwise From.
 */
const recipientOf = (message) => firstAddress(message?.replyTo) || firstAddress(message?.from);

const replySubject = (subject) => {
  const clean = singleLine(subject || '');
  if (!clean) {
    return `Re: ${NO_SUBJECT}`;
  }
  return REPLY_PREFIX.test(clean) ? clean : `Re: ${clean}`;
};

/**
 * In-Reply-To and References, so the reply lands inside the conversation the correspondent
 * already has open rather than starting a new one. Messages stored before these headers were
 * captured simply get no threading.
 */
const threadHeaders = (message) => {
  const messageId = message?.messageId ? singleLine(message.messageId) : '';
  if (!messageId) {
    return {};
  }
  const stored = Array.isArray(message.references)
    ? message.references.join(' ')
    : message.references || '';
  const chain = singleLine(stored);
  return {
    'In-Reply-To': messageId,
    References: chain ? `${chain} ${messageId}` : messageId,
  };
};

const quoteOriginal = (message) => {
  const text = typeof message?.text === 'string' ? message.text.trim() : '';
  if (!text) {
    return '';
  }
  const when = message.date || message.receivedAt;
  const attribution = when
    ? `On ${singleLine(when)}, ${singleLine(message.from)} wrote:`
    : `${singleLine(message.from)} wrote:`;
  const quoted = text.split('\n').map((line) => `> ${line}`).join('\n');
  return `${attribution}\n${quoted}`;
};

const domainOf = (address) => address.slice(address.lastIndexOf('@') + 1);

/**
 * Assemble the outbound reply, or throw a coded ReplyError describing why it may not be sent.
 *
 * @param {Object} params
 * @param {string} params.mailbox      The temporary address that received the message.
 * @param {Object} params.message      The stored message being answered.
 * @param {string} params.body         Plain text typed by the user.
 * @param {number} params.maxBodyChars Cap on the typed text.
 * @param {string[]} params.serviceDomains Domains this service itself accepts mail for.
 */
const buildReply = ({ mailbox, message, body, maxBodyChars, serviceDomains }) => {
  if (typeof body !== 'string' || !body.trim()) {
    throw new ReplyError('EMPTY_BODY', 'Write something before sending the reply.');
  }
  if (body.length > maxBodyChars) {
    throw new ReplyError('BODY_TOO_LONG', `A reply can be at most ${maxBodyChars} characters.`);
  }

  const to = recipientOf(message);
  if (!to) {
    throw new ReplyError('NO_REPLY_RECIPIENT', 'This message has no address to reply to.');
  }

  const blocked = serviceDomains.map((domain) => domain.toLowerCase());
  if (blocked.includes(domainOf(to))) {
    throw new ReplyError(
      'RECIPIENT_NOT_ALLOWED',
      'Replies to temporary addresses are not allowed.'
    );
  }

  const quoted = quoteOriginal(message);

  return {
    from: mailbox,
    to,
    replyTo: mailbox,
    subject: replySubject(message.subject),
    text: quoted ? `${body.trim()}\n\n${quoted}` : body.trim(),
    headers: {
      ...threadHeaders(message),
      'X-Hide-Mail-Reply': 'true',
    },
    // Bounces belong to the mailbox that sent the reply, not to the forwarding sender.
    envelope: { from: mailbox, to },
  };
};

module.exports = {
  ReplyError,
  recipientOf,
  replySubject,
  threadHeaders,
  quoteOriginal,
  buildReply,
};
