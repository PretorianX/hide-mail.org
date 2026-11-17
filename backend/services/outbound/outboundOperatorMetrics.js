/**
 * Operator-facing outbound series on the existing :9001 metrics server.
 * Values are set from Redis on every refresh (survive redeploys).
 */

const client = require('prom-client');
const redisService = require('../redisService');
const store = require('./outboundMetricsStore');
const renderer = require('./outboundMetricsRenderer');
const operatorDnsHealth = require('./operatorDnsHealth');
const accountService = require('./accountService');
const logger = require('../../utils/logger');

const GLOBAL_DOMAINS_INDEX = 'outbound:domains:index';
const META_PREFIX = 'outbound:domain:meta:';
const STREAM = 'outbound:events';
const GROUP = 'backend-consumers';

let gauges = null;

const ensureGauges = () => {
  if (gauges) {
    return gauges;
  }

  gauges = {
    dnsCheckTotal: new client.Gauge({
      name: 'hidemail_outbound_dns_check_total',
      help: 'DNS check outcomes for outbound domains',
      labelNames: ['domain', 'outcome', 'account'],
    }),
    eventConsumerLag: new client.Gauge({
      name: 'hidemail_outbound_event_consumer_lag',
      help: 'Pending outbound:events entries for the backend consumer group',
    }),
    operatorDnsOk: new client.Gauge({
      name: 'hidemail_outbound_operator_dns_ok',
      help: 'Operator DNS health checks (1 ok, 0 fail)',
      labelNames: ['check'],
    }),
    accepted: new client.Gauge({
      name: 'hidemail_outbound_accepted_total',
      help: 'Messages accepted by the API',
      labelNames: ['domain', 'account'],
    }),
    delivered: new client.Gauge({
      name: 'hidemail_outbound_delivered_total',
      help: 'Accepted by the recipient server',
      labelNames: ['domain', 'account'],
    }),
    deferred: new client.Gauge({
      name: 'hidemail_outbound_deferred_total',
      help: 'Temporary failures (each attempt)',
      labelNames: ['domain', 'account'],
    }),
    held: new client.Gauge({
      name: 'hidemail_outbound_held_total',
      help: 'Attempts skipped because domain may not send',
      labelNames: ['domain', 'account'],
    }),
    bounced: new client.Gauge({
      name: 'hidemail_outbound_bounced_total',
      help: 'Permanent failures by category',
      labelNames: ['domain', 'category', 'account'],
    }),
    rejected: new client.Gauge({
      name: 'hidemail_outbound_rejected_total',
      help: 'Refused by the API by reason',
      labelNames: ['domain', 'reason', 'account'],
    }),
    suppressions: new client.Gauge({
      name: 'hidemail_outbound_suppressions',
      help: 'Current suppression list size by reason',
      labelNames: ['reason', 'account'],
    }),
    dailySent: new client.Gauge({
      name: 'hidemail_outbound_daily_sent',
      help: 'Count for the current UTC day',
      labelNames: ['domain', 'account'],
    }),
    dailyLimit: new client.Gauge({
      name: 'hidemail_outbound_daily_limit',
      help: 'The cap; +Inf when none',
      labelNames: ['domain', 'account'],
    }),
    domainVerified: new client.Gauge({
      name: 'hidemail_outbound_domain_verified',
      help: '1 if verified else 0',
      labelNames: ['domain', 'account'],
    }),
    queued: new client.Gauge({
      name: 'hidemail_outbound_queued',
      help: 'Accepted and not yet delivered or bounced',
      labelNames: ['domain', 'account'],
    }),
  };

  return gauges;
};

const resetSeries = (g) => {
  for (const gauge of Object.values(g)) {
    if (typeof gauge.reset === 'function') {
      gauge.reset();
    }
  }
};

const readEventConsumerLag = async () => {
  try {
    if (typeof redisService.client.xpending !== 'function') {
      return 0;
    }
    const pending = await redisService.client.xpending(STREAM, GROUP);
    // ioredis XPENDING without idle/consumer returns [count, ...]
    if (Array.isArray(pending) && pending.length > 0) {
      return Number(pending[0]) || 0;
    }
    return 0;
  } catch (error) {
    if (String(error.message || error).includes('NOGROUP')) {
      return 0;
    }
    logger.error('Failed to read outbound event consumer lag', error);
    return 0;
  }
};

const refresh = async () => {
  const g = ensureGauges();
  resetSeries(g);

  const domains = await redisService.client.smembers(GLOBAL_DOMAINS_INDEX);
  const accountsSeen = new Set();

  for (const domain of domains) {
    const raw = await redisService.client.get(`${META_PREFIX}${domain}`);
    if (!raw) continue;
    const meta = JSON.parse(raw);
    const accountId = meta.accountId;
    accountsSeen.add(accountId);

    const counters = await store.readCounters(domain);
    const labels = { domain, account: accountId };
    g.accepted.set(labels, counters.accepted);
    g.delivered.set(labels, counters.delivered);
    g.deferred.set(labels, counters.deferred);
    g.held.set(labels, counters.held);
    g.queued.set(labels, counters.queued);
    g.domainVerified.set(labels, meta.state === 'verified' ? 1 : 0);

    const capService = require('./capService');
    const sentToday = await capService.peekCounter(domain);
    g.dailySent.set(labels, sentToday);
    const limit =
      meta.dailyLimit === null || meta.dailyLimit === undefined
        ? Number.POSITIVE_INFINITY
        : Number(meta.dailyLimit);
    g.dailyLimit.set(labels, limit);

    for (const [category, value] of Object.entries(counters.bounced)) {
      if (value > 0) {
        g.bounced.set({ domain, category, account: accountId }, value);
      }
    }
    for (const [reason, value] of Object.entries(counters.rejected)) {
      if (value > 0) {
        g.rejected.set({ domain, reason, account: accountId }, value);
      }
    }

    for (const outcome of ['pass', 'fail', 'no_answer']) {
      const n = await store.readDnsOutcome(domain, outcome);
      if (n > 0) {
        g.dnsCheckTotal.set({ domain, outcome, account: accountId }, n);
      }
    }
  }

  const suppressionService = require('./suppressionService');
  for (const accountId of accountsSeen) {
    const rows = await suppressionService.listSuppressions({ accountId });
    const byReason = {};
    for (const row of rows) {
      byReason[row.reason] = (byReason[row.reason] || 0) + 1;
    }
    for (const [reason, value] of Object.entries(byReason)) {
      g.suppressions.set({ reason, account: accountId }, value);
    }
  }

  // Also cover accounts that have suppressions but no domains yet
  const accountKeys = await accountService.listAccounts();
  for (const acct of accountKeys) {
    if (accountsSeen.has(acct.accountId)) continue;
    const rows = await suppressionService.listSuppressions({ accountId: acct.accountId });
    const byReason = {};
    for (const row of rows) {
      byReason[row.reason] = (byReason[row.reason] || 0) + 1;
    }
    for (const [reason, value] of Object.entries(byReason)) {
      g.suppressions.set({ reason, account: acct.accountId }, value);
    }
  }

  g.eventConsumerLag.set(await readEventConsumerLag());

  const health = await operatorDnsHealth.getOperatorDnsHealth();
  g.operatorDnsOk.set({ check: 'return_path_mx' }, health.return_path_mx);
  g.operatorDnsOk.set({ check: 'return_path_spf' }, health.return_path_spf);
  g.operatorDnsOk.set({ check: 'helo_a' }, health.helo_a);
};

/**
 * Review Focus helper: customer text for one account vs operator gauge values.
 * Uses exact label substring match (no RegExp) so hostnames/backslashes stay literal.
 */
const customerAcceptedLine = async (accountId, domain) => {
  const text = await renderer.renderAccount({ accountId });
  const needle = `hidemail_outbound_accepted_total{domain="${renderer.escapeLabel(domain)}"} `;
  const start = text.indexOf(needle);
  if (start === -1) {
    return null;
  }
  let end = start + needle.length;
  while (end < text.length && text.charCodeAt(end) >= 48 && text.charCodeAt(end) <= 57) {
    end += 1;
  }
  if (end === start + needle.length) {
    return null;
  }
  return Number(text.slice(start + needle.length, end));
};

const register = () => {
  ensureGauges();
};

module.exports = {
  register,
  refresh,
  customerAcceptedLine,
  // test seam
  _resetForTests: () => {
    gauges = null;
  },
};
