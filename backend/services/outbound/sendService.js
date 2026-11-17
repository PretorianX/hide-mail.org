/**
 * Outbound send path — ordered checks per Global Constraints / spec 5.4.
 */

const crypto = require('crypto');
const nodemailer = require('nodemailer');

const config = require('../../config/config');
const defaultDomainService = require('./domainService');
const defaultCapService = require('./capService');
const defaultAccountRateLimiter = require('./accountRateLimiter');
const defaultMessageStore = require('./messageStore');
const defaultSuppressionService = require('./suppressionService');

class SendError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'SendError';
    this.code = code;
    Object.assign(this, extra);
  }
}

const RECIPIENT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const createDefaultTransport = () =>
  nodemailer.createTransport({
    host: config.outbound.zoneMta.host,
    port: config.outbound.zoneMta.port,
    secure: false,
    ignoreTLS: true,
  });

const resolveDeps = (overrides = {}) => ({
  domainService: overrides.domainService || defaultDomainService,
  capService: overrides.capService || defaultCapService,
  accountRateLimiter: overrides.accountRateLimiter || defaultAccountRateLimiter,
  messageStore: overrides.messageStore || defaultMessageStore,
  suppressionService: overrides.suppressionService || defaultSuppressionService,
  mimeTransport: overrides.mimeTransport || createDefaultTransport(),
});

const extractDomain = (fromEmail) => {
  if (!fromEmail || typeof fromEmail !== 'string' || !fromEmail.includes('@')) {
    return null;
  }
  return fromEmail.split('@').pop().toLowerCase();
};

const estimateMessageBytes = ({ text, html, attachments }) => {
  let total = Buffer.byteLength(text || '', 'utf8') + Buffer.byteLength(html || '', 'utf8');
  for (const attachment of attachments || []) {
    if (attachment?.content) {
      total += Buffer.byteLength(String(attachment.content), 'utf8');
    }
  }
  return total;
};

const sendMessage = async (payload, overrides = {}) => {
  const deps = resolveDeps(overrides);
  const {
    accountId,
    from,
    to,
    subject,
    text,
    html,
    replyTo,
    attachments,
    reference,
    idempotencyKey,
  } = payload;

  if (idempotencyKey) {
    const replay = await deps.messageStore.getReplay({ accountId, idempotencyKey });
    if (replay) {
      return replay.body;
    }
  }

  // (1) per-account rate limit
  const rate = await deps.accountRateLimiter.checkAndIncrement(accountId);
  if (!rate.allowed) {
    throw new SendError('RATE_LIMITED', 'Account send rate limit exceeded', {
      retryAfterSeconds: rate.retryAfterSeconds,
      limit: rate.limit,
    });
  }

  // (3) From domain verified and not suspended (auth already done by middleware)
  const domain = extractDomain(from?.email);
  if (!domain) {
    throw new SendError('DOMAIN_NOT_VERIFIED', 'From address domain is missing or invalid');
  }

  const meta = await deps.domainService.getDomainMeta(domain);
  if (!meta || meta.accountId !== accountId || meta.state !== 'verified') {
    throw new SendError('DOMAIN_NOT_VERIFIED', `Domain ${domain} is not verified for sending`);
  }
  if (meta.suspended) {
    throw new SendError('DOMAIN_SUSPENDED', `Domain ${domain} is suspended`);
  }

  // (4) recipient syntax
  if (!to || typeof to !== 'string' || !RECIPIENT_RE.test(to)) {
    throw new SendError('INVALID_RECIPIENT', 'Recipient address is invalid');
  }

  // (5) suppression
  if (await deps.suppressionService.isSuppressed({ accountId, email: to })) {
    throw new SendError('RECIPIENT_SUPPRESSED', 'Recipient is on the suppression list');
  }

  // (6) daily cap
  const cap = await deps.capService.checkAndIncrement(domain);
  if (!cap.allowed) {
    throw new SendError('DAILY_LIMIT_REACHED', 'Daily send limit reached', {
      resetAt: cap.resetAt,
      remaining: 0,
    });
  }

  // (7) size — after cap reservation; release on refusal
  const sizeBytes = estimateMessageBytes({ text, html, attachments });
  if (sizeBytes > config.outbound.maxMessageBytes) {
    await deps.capService.releaseIncrement(domain);
    throw new SendError('MESSAGE_TOO_LARGE', 'Message exceeds OUTBOUND_MAX_MESSAGE_BYTES');
  }

  const messageId = crypto.randomUUID();
  const envelopeFrom = `b-${messageId}@hm-bounce.${domain}`;

  try {
    await deps.mimeTransport.sendMail({
      from: {
        name: from?.name || undefined,
        address: from.email,
      },
      to,
      subject: subject || '',
      text: text || undefined,
      html: html || undefined,
      replyTo: replyTo || undefined,
      attachments: (attachments || []).map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        content: a.content ? Buffer.from(a.content, 'base64') : undefined,
      })),
      envelope: {
        from: envelopeFrom,
        to: [to],
      },
    });
  } catch (error) {
    await deps.capService.releaseIncrement(domain);
    throw new SendError('ZONEMTA_UNAVAILABLE', 'ZoneMTA refused or could not accept the message', {
      cause: error,
    });
  }

  await deps.messageStore.createMessage({
    id: messageId,
    accountId,
    domain,
    recipient: to,
    reference: reference ?? null,
  });

  const body = { id: messageId, status: 'queued' };

  if (idempotencyKey) {
    await deps.messageStore.storeReplay({
      accountId,
      idempotencyKey,
      statusCode: 202,
      body,
    });
  }

  return body;
};

const getMessageForAccount = async ({ accountId, id }, overrides = {}) => {
  const deps = resolveDeps(overrides);
  const message = await deps.messageStore.getMessage(id);
  if (!message || message.accountId !== accountId) {
    return null;
  }
  return message;
};

const getAccountSummary = async ({ accountId }, overrides = {}) => {
  const deps = resolveDeps(overrides);
  const domains = await deps.domainService.listDomains({ accountId });
  const enriched = await Promise.all(
    domains.map(async (d) => {
      const sentToday = await deps.capService.peekCounter(d.domain);
      return {
        domain: d.domain,
        state: d.state,
        suspended: d.suspended,
        dailyLimit: d.dailyLimit,
        sentToday,
      };
    })
  );
  return { domains: enriched };
};

module.exports = {
  SendError,
  sendMessage,
  getMessageForAccount,
  getAccountSummary,
};
