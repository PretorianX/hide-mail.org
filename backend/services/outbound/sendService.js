/**
 * Outbound send path — ordered checks per Global Constraints / spec 5.4.
 * Delivery relay is Postfix (compose service). DKIM is signed here with the
 * domain's stored key (ZoneMTA/Mongo removed — host has no AVX for Mongo 5+).
 */

const crypto = require('crypto');
const nodemailer = require('nodemailer');

const config = require('../../config/config');
const keyCrypto = require('./keyCrypto');
const defaultDomainService = require('./domainService');
const defaultCapService = require('./capService');
const defaultAccountRateLimiter = require('./accountRateLimiter');
const defaultMessageStore = require('./messageStore');
const defaultSuppressionService = require('./suppressionService');
const defaultMetricsStore = require('./outboundMetricsStore');

const REJECT_REASON_BY_CODE = {
  RATE_LIMITED: 'rate_limit',
  DOMAIN_NOT_VERIFIED: 'domain_not_verified',
  DOMAIN_SUSPENDED: 'domain_suspended',
  INVALID_RECIPIENT: 'invalid_recipient',
  RECIPIENT_SUPPRESSED: 'suppressed',
  DAILY_LIMIT_REACHED: 'daily_limit',
};

class SendError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'SendError';
    this.code = code;
    Object.assign(this, extra);
  }
}

/** Reject whitespace without a regex (avoids ReDoS on attacker-controlled `to`). */
const hasAsciiWhitespace = (value) => {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code === 9 || code === 10 || code === 13 || code === 32) {
      return true;
    }
  }
  return false;
};

/**
 * Minimal recipient syntax check without backtracking regexes.
 * Requires a single `@`, non-empty local part, and a domain with a non-edge `.`.
 */
const isValidRecipient = (to) => {
  if (typeof to !== 'string' || to.length < 3 || to.length > 320) {
    return false;
  }
  if (hasAsciiWhitespace(to)) {
    return false;
  }
  const at = to.indexOf('@');
  if (at <= 0 || at !== to.lastIndexOf('@') || at === to.length - 1) {
    return false;
  }
  const domain = to.slice(at + 1);
  const dot = domain.indexOf('.');
  return dot > 0 && dot < domain.length - 1;
};

const createDefaultTransport = () =>
  nodemailer.createTransport({
    host: config.outbound.relay.host,
    port: config.outbound.relay.port,
    secure: config.outbound.relay.secure,
    ignoreTLS: !config.outbound.relay.secure,
  });

const resolveDeps = (overrides = {}) => ({
  domainService: overrides.domainService || defaultDomainService,
  capService: overrides.capService || defaultCapService,
  accountRateLimiter: overrides.accountRateLimiter || defaultAccountRateLimiter,
  messageStore: overrides.messageStore || defaultMessageStore,
  suppressionService: overrides.suppressionService || defaultSuppressionService,
  mimeTransport: overrides.mimeTransport || createDefaultTransport(),
  metricsStore: overrides.metricsStore || defaultMetricsStore,
});

const rejectAndThrow = async (metricsStore, domain, error) => {
  const reason = REJECT_REASON_BY_CODE[error.code];
  if (reason) {
    await metricsStore.incrRejected(domain || '_unknown', reason);
  }
  throw error;
};

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

const buildDkimOption = (meta) => {
  if (!meta?.privateKeyEnc || !meta?.selector) {
    throw new SendError('DOMAIN_NOT_VERIFIED', 'Domain signing key is missing');
  }
  const privateKey = keyCrypto.decrypt(meta.privateKeyEnc, config.outbound.keyEncryptionSecret);
  return {
    domainName: meta.domain || extractDomain(meta.fromEmail) || undefined,
    keySelector: meta.selector,
    privateKey,
  };
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
    clientIp = null,
    sendKeyName = null,
  } = payload;

  if (idempotencyKey) {
    const replay = await deps.messageStore.getReplay({ accountId, idempotencyKey });
    if (replay) {
      return replay.body;
    }
  }

  const domainHint = extractDomain(from?.email) || '_unknown';

  const rate = await deps.accountRateLimiter.checkAndIncrement(accountId);
  if (!rate.allowed) {
    await rejectAndThrow(
      deps.metricsStore,
      domainHint,
      new SendError('RATE_LIMITED', 'Account send rate limit exceeded', {
        retryAfterSeconds: rate.retryAfterSeconds,
        limit: rate.limit,
      })
    );
  }

  const domain = extractDomain(from?.email);
  if (!domain) {
    await rejectAndThrow(
      deps.metricsStore,
      '_unknown',
      new SendError('DOMAIN_NOT_VERIFIED', 'From address domain is missing or invalid')
    );
  }

  const meta = await deps.domainService.getDomainMeta(domain);
  if (!meta || meta.accountId !== accountId || meta.state !== 'verified') {
    await rejectAndThrow(
      deps.metricsStore,
      domain,
      new SendError('DOMAIN_NOT_VERIFIED', `Domain ${domain} is not verified for sending`)
    );
  }
  if (meta.suspended) {
    await rejectAndThrow(
      deps.metricsStore,
      domain,
      new SendError('DOMAIN_SUSPENDED', `Domain ${domain} is suspended`)
    );
  }

  if (!isValidRecipient(to)) {
    await rejectAndThrow(
      deps.metricsStore,
      domain,
      new SendError('INVALID_RECIPIENT', 'Recipient address is invalid')
    );
  }

  if (await deps.suppressionService.isSuppressed({ accountId, email: to })) {
    await rejectAndThrow(
      deps.metricsStore,
      domain,
      new SendError('RECIPIENT_SUPPRESSED', 'Recipient is on the suppression list')
    );
  }

  const cap = await deps.capService.checkAndIncrement(domain);
  if (!cap.allowed) {
    await rejectAndThrow(
      deps.metricsStore,
      domain,
      new SendError('DAILY_LIMIT_REACHED', 'Daily send limit reached', {
        resetAt: cap.resetAt,
        remaining: 0,
      })
    );
  }

  const sizeBytes = estimateMessageBytes({ text, html, attachments });
  if (sizeBytes > config.outbound.maxMessageBytes) {
    await deps.capService.releaseIncrement(domain);
    throw new SendError('MESSAGE_TOO_LARGE', 'Message exceeds OUTBOUND_MAX_MESSAGE_BYTES');
  }

  const messageId = crypto.randomUUID();
  const envelopeFrom = `b-${messageId}@hm-bounce.${domain}`;

  let dkim;
  try {
    dkim = buildDkimOption({ ...meta, domain });
  } catch (error) {
    await deps.capService.releaseIncrement(domain);
    if (error instanceof SendError) {
      throw error;
    }
    throw new SendError('DOMAIN_NOT_VERIFIED', 'Domain signing key could not be loaded', {
      cause: error,
    });
  }

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
      dkim,
    });
  } catch (error) {
    await deps.capService.releaseIncrement(domain);
    throw new SendError('RELAY_UNAVAILABLE', 'Postfix refused or could not accept the message', {
      cause: error,
    });
  }

  await deps.messageStore.createMessage({
    id: messageId,
    accountId,
    domain,
    recipient: to,
    reference: reference ?? null,
    subject: subject || null,
    from: from?.email
      ? { name: from.name || null, email: from.email }
      : null,
    envelopeFrom,
    clientIp: clientIp || null,
    sendKeyName: sendKeyName || null,
  });

  await deps.metricsStore.incrAccepted(domain);
  // No ZoneMTA delivery hooks: Postfix accept is the terminal "delivered" signal.
  // Late DSN bounces still supersede via bounceMailback → eventConsumer.
  await deps.messageStore.updateStatus({
    id: messageId,
    status: 'delivered',
    response: 'accepted by postfix',
  });
  await deps.metricsStore.incrDelivered(domain, messageId);

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

const sumBounced = (bounced = {}) =>
  Object.values(bounced).reduce((sum, value) => sum + (Number(value) || 0), 0);

const emptyWindowCounts = () => ({
  delivered24h: 0,
  deferred24h: 0,
  bounced24h: 0,
  delivered7d: 0,
  deferred7d: 0,
  bounced7d: 0,
});

const buildWindowCountsByDomain = (messages, now = Date.now()) => {
  const dayMs = 24 * 60 * 60 * 1000;
  const byDomain = new Map();
  for (const message of messages) {
    const domain = message.domain;
    if (!byDomain.has(domain)) {
      byDomain.set(domain, emptyWindowCounts());
    }
    const status = message.status;
    if (status !== 'delivered' && status !== 'deferred' && status !== 'bounced') {
      continue;
    }
    const at = message.lastEventAt || message.createdAt || 0;
    const counts = byDomain.get(domain);
    if (now - at <= dayMs) {
      counts[`${status}24h`] += 1;
    }
    if (now - at <= 7 * dayMs) {
      counts[`${status}7d`] += 1;
    }
  }
  return byDomain;
};

const getAccountSummary = async ({ accountId }, overrides = {}) => {
  const deps = resolveDeps(overrides);
  const domains = await deps.domainService.listDomains({ accountId });
  const ratePerMinute = await deps.accountRateLimiter.getLimit(accountId);
  const recent = await deps.messageStore.listRecentMessages({ accountId, limit: 500 });
  const windowByDomain = buildWindowCountsByDomain(recent);

  const enriched = await Promise.all(
    domains.map(async (d) => {
      const sentToday = await deps.capService.peekCounter(d.domain);
      const counters = await deps.metricsStore.readCounters(d.domain);
      const windows = windowByDomain.get(d.domain) || emptyWindowCounts();
      return {
        domain: d.domain,
        state: d.state,
        suspended: d.suspended,
        dailyLimit: d.dailyLimit,
        sentToday,
        delivered: counters.delivered,
        deferred: counters.deferred,
        bounced: sumBounced(counters.bounced),
        ...windows,
      };
    })
  );
  return { ratePerMinute, domains: enriched };
};

module.exports = {
  SendError,
  sendMessage,
  getMessageForAccount,
  getAccountSummary,
};
