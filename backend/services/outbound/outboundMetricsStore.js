/**
 * Redis-backed outbound metrics counters.
 *
 * Counts survive backend redeploys; Prometheus scrapes render from these keys
 * (see outboundMetricsRenderer / outboundOperatorMetrics).
 *
 * Redis keys:
 *   outbound:metrics:c:<domain>:accepted
 *   outbound:metrics:c:<domain>:delivered|deferred|held
 *   outbound:metrics:c:<domain>:bounced:<category>
 *   outbound:metrics:c:<domain>:rejected:<reason>
 *   outbound:metrics:queued:<domain>
 *   outbound:metrics:dns:<domain>:<outcome>
 *   outbound:metrics:applied:<streamId>     SET NX, TTL 30d
 *   outbound:metrics:terminal:<messageId>   SET NX (delivered|bounced)
 */

const redisService = require('../redisService');

const APPLIED_TTL_SECONDS = 30 * 86400;
const BOUNCE_CATEGORIES = [
  'unknown_recipient',
  'mailbox',
  'policy',
  'reputation',
  'held',
  'other',
];
const REJECT_REASONS = [
  'invalid_recipient',
  'suppressed',
  'daily_limit',
  'rate_limit',
  'domain_not_verified',
  'domain_suspended',
];

const counterKey = (domain, name) => `outbound:metrics:c:${domain}:${name}`;
const queuedKey = (domain) => `outbound:metrics:queued:${domain}`;
const dnsKey = (domain, outcome) => `outbound:metrics:dns:${domain}:${outcome}`;
const appliedKey = (streamId) => `outbound:metrics:applied:${streamId}`;
const terminalKey = (messageId) => `outbound:metrics:terminal:${messageId}`;

const readInt = async (key) => {
  const raw = await redisService.client.get(key);
  return raw === null ? 0 : Number(raw) || 0;
};

const safeDecrQueued = async (domain) => {
  const key = queuedKey(domain);
  const current = await readInt(key);
  if (current <= 0) {
    await redisService.client.set(key, '0');
    return;
  }
  await redisService.client.decr(key);
};

const markApplied = async (streamId) => {
  if (!streamId) {
    return false;
  }
  const result = await redisService.client.set(appliedKey(streamId), '1', 'NX');
  if (result === null) {
    return false;
  }
  await redisService.client.expire(appliedKey(streamId), APPLIED_TTL_SECONDS);
  return true;
};

const markTerminal = async (messageId, type) => {
  if (!messageId) {
    return false;
  }
  const result = await redisService.client.set(terminalKey(messageId), type, 'NX');
  return result !== null;
};

const incrAccepted = async (domain) => {
  await redisService.client.incr(counterKey(domain, 'accepted'));
  await redisService.client.incr(queuedKey(domain));
};

const incrRejected = async (domain, reason) => {
  if (!REJECT_REASONS.includes(reason)) {
    throw new Error(`Unknown rejected reason: ${reason}`);
  }
  await redisService.client.incr(counterKey(domain, `rejected:${reason}`));
};

const incrDeferred = async (domain, streamId) => {
  if (!(await markApplied(streamId))) {
    return false;
  }
  await redisService.client.incr(counterKey(domain, 'deferred'));
  return true;
};

const incrHeld = async (domain, streamId) => {
  if (!(await markApplied(streamId))) {
    return false;
  }
  await redisService.client.incr(counterKey(domain, 'held'));
  return true;
};

const incrDelivered = async (domain, messageId) => {
  if (!(await markTerminal(messageId, 'delivered'))) {
    return false;
  }
  await redisService.client.incr(counterKey(domain, 'delivered'));
  await safeDecrQueued(domain);
  return true;
};

const incrBounced = async (domain, messageId, category) => {
  const cat = BOUNCE_CATEGORIES.includes(category) ? category : 'other';
  if (!(await markTerminal(messageId, 'bounced'))) {
    return false;
  }
  await redisService.client.incr(counterKey(domain, `bounced:${cat}`));
  await safeDecrQueued(domain);
  return true;
};

const incrDnsOutcome = async (domain, outcome) => {
  if (!['pass', 'fail', 'no_answer'].includes(outcome)) {
    throw new Error(`Unknown DNS outcome: ${outcome}`);
  }
  await redisService.client.incr(dnsKey(domain, outcome));
};

const readDnsOutcome = async (domain, outcome) => readInt(dnsKey(domain, outcome));

const readCounters = async (domain) => {
  const bounced = {};
  for (const category of BOUNCE_CATEGORIES) {
    bounced[category] = await readInt(counterKey(domain, `bounced:${category}`));
  }
  const rejected = {};
  for (const reason of REJECT_REASONS) {
    rejected[reason] = await readInt(counterKey(domain, `rejected:${reason}`));
  }
  return {
    accepted: await readInt(counterKey(domain, 'accepted')),
    delivered: await readInt(counterKey(domain, 'delivered')),
    deferred: await readInt(counterKey(domain, 'deferred')),
    held: await readInt(counterKey(domain, 'held')),
    bounced,
    rejected,
    queued: await readInt(queuedKey(domain)),
  };
};

module.exports = {
  BOUNCE_CATEGORIES,
  REJECT_REASONS,
  incrAccepted,
  incrRejected,
  incrDeferred,
  incrHeld,
  incrDelivered,
  incrBounced,
  incrDnsOutcome,
  readDnsOutcome,
  readCounters,
};
