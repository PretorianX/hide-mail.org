/**
 * Render outbound §5.8 Prometheus text from Redis for one account.
 */

const domainService = require('./domainService');
const capService = require('./capService');
const suppressionService = require('./suppressionService');
const store = require('./outboundMetricsStore');

const escapeLabel = (value) => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const labels = (parts) =>
  `{${Object.entries(parts)
    .map(([k, v]) => `${k}="${escapeLabel(v)}"`)
    .join(',')}}`;

const line = (name, labelParts, value) => `${name}${labels(labelParts)} ${value}`;

const renderAccount = async ({ accountId, accountLabel = false }) => {
  const domains = await domainService.listDomains({ accountId });
  const lines = [];

  const maybeAccount = (base) => (accountLabel ? { account: accountId, ...base } : base);

  lines.push('# HELP hidemail_outbound_accepted_total Messages accepted by the API');
  lines.push('# TYPE hidemail_outbound_accepted_total gauge');
  lines.push('# HELP hidemail_outbound_delivered_total Accepted by the recipient server');
  lines.push('# TYPE hidemail_outbound_delivered_total gauge');
  lines.push('# HELP hidemail_outbound_deferred_total Temporary failures (each attempt)');
  lines.push('# TYPE hidemail_outbound_deferred_total gauge');
  lines.push('# HELP hidemail_outbound_held_total Attempts skipped because domain may not send');
  lines.push('# TYPE hidemail_outbound_held_total gauge');
  lines.push('# HELP hidemail_outbound_bounced_total Permanent failures by category');
  lines.push('# TYPE hidemail_outbound_bounced_total gauge');
  lines.push('# HELP hidemail_outbound_rejected_total Refused by the API by reason');
  lines.push('# TYPE hidemail_outbound_rejected_total gauge');
  lines.push('# HELP hidemail_outbound_suppressions Current suppression list size by reason');
  lines.push('# TYPE hidemail_outbound_suppressions gauge');
  lines.push('# HELP hidemail_outbound_daily_sent Count for the current UTC day');
  lines.push('# TYPE hidemail_outbound_daily_sent gauge');
  lines.push('# HELP hidemail_outbound_daily_limit The cap; +Inf when none');
  lines.push('# TYPE hidemail_outbound_daily_limit gauge');
  lines.push('# HELP hidemail_outbound_domain_verified 1 if verified else 0');
  lines.push('# TYPE hidemail_outbound_domain_verified gauge');
  lines.push('# HELP hidemail_outbound_queued Accepted and not yet delivered or bounced');
  lines.push('# TYPE hidemail_outbound_queued gauge');

  for (const d of domains) {
    const domain = d.domain;
    const counters = await store.readCounters(domain);
    const sentToday = await capService.peekCounter(domain);
    const limitValue = d.dailyLimit === null || d.dailyLimit === undefined ? '+Inf' : d.dailyLimit;
    const verified = d.state === 'verified' ? 1 : 0;

    lines.push(line('hidemail_outbound_accepted_total', maybeAccount({ domain }), counters.accepted));
    lines.push(line('hidemail_outbound_delivered_total', maybeAccount({ domain }), counters.delivered));
    lines.push(line('hidemail_outbound_deferred_total', maybeAccount({ domain }), counters.deferred));
    lines.push(line('hidemail_outbound_held_total', maybeAccount({ domain }), counters.held));

    for (const [category, value] of Object.entries(counters.bounced)) {
      if (value > 0) {
        lines.push(
          line('hidemail_outbound_bounced_total', maybeAccount({ domain, category }), value)
        );
      }
    }
    for (const [reason, value] of Object.entries(counters.rejected)) {
      if (value > 0) {
        lines.push(
          line('hidemail_outbound_rejected_total', maybeAccount({ domain, reason }), value)
        );
      }
    }

    lines.push(line('hidemail_outbound_daily_sent', maybeAccount({ domain }), sentToday));
    lines.push(line('hidemail_outbound_daily_limit', maybeAccount({ domain }), limitValue));
    lines.push(line('hidemail_outbound_domain_verified', maybeAccount({ domain }), verified));
    lines.push(line('hidemail_outbound_queued', maybeAccount({ domain }), counters.queued));
  }

  const suppressions = await suppressionService.listSuppressions({ accountId });
  const byReason = {};
  for (const row of suppressions) {
    byReason[row.reason] = (byReason[row.reason] || 0) + 1;
  }
  for (const [reason, value] of Object.entries(byReason)) {
    const labelParts = accountLabel ? { account: accountId, reason } : { reason };
    lines.push(line('hidemail_outbound_suppressions', labelParts, value));
  }

  return `${lines.join('\n')}\n`;
};

module.exports = {
  renderAccount,
  escapeLabel,
};
