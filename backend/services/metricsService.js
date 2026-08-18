/**
 * Prometheus Metrics Service
 *
 * Exposes application metrics on a dedicated HTTP server (port 9090)
 * for scraping by Grafana Agent / Prometheus.
 *
 * Metric naming follows the convention: hidemail_<subsystem>_<metric>_<unit>
 */

const client = require('prom-client');
const http = require('http');
const logger = require('../utils/logger');

const METRICS_PORT = parseInt(process.env.METRICS_PORT || 9001);

// Collect default Node.js metrics (GC, event loop, memory, etc.)
client.collectDefaultMetrics({ prefix: 'hidemail_' });

// ---------------------------------------------------------------------------
// Mailbox metrics
// ---------------------------------------------------------------------------

const mailboxesRegisteredTotal = new client.Counter({
  name: 'hidemail_mailbox_registrations_total',
  help: 'Total number of temporary mailboxes registered',
});

const mailboxesRefreshedTotal = new client.Counter({
  name: 'hidemail_mailbox_refreshes_total',
  help: 'Total number of mailbox TTL refreshes',
});

const mailboxesDeactivatedTotal = new client.Counter({
  name: 'hidemail_mailbox_deactivations_total',
  help: 'Total number of mailbox deactivations',
});

// ---------------------------------------------------------------------------
// Email / SMTP metrics
// ---------------------------------------------------------------------------

const smtpConnectionsTotal = new client.Counter({
  name: 'hidemail_smtp_connections_total',
  help: 'Total incoming SMTP connections',
});

const smtpRecipientsAcceptedTotal = new client.Counter({
  name: 'hidemail_smtp_recipients_accepted_total',
  help: 'Total SMTP recipients accepted',
});

const smtpRecipientsRejectedTotal = new client.Counter({
  name: 'hidemail_smtp_recipients_rejected_total',
  help: 'Total SMTP recipients rejected',
  labelNames: ['reason'],
});

const emailsReceivedTotal = new client.Counter({
  name: 'hidemail_emails_received_total',
  help: 'Total emails received via SMTP (data stage)',
});

const emailsStoredTotal = new client.Counter({
  name: 'hidemail_emails_stored_total',
  help: 'Total emails successfully stored in Redis',
});

const emailsDroppedTotal = new client.Counter({
  name: 'hidemail_emails_dropped_total',
  help: 'Total emails silently dropped',
  labelNames: ['reason'],
});

const smtpErrorsTotal = new client.Counter({
  name: 'hidemail_smtp_errors_total',
  help: 'Total SMTP processing errors',
});

const emailSizeBytes = new client.Histogram({
  name: 'hidemail_email_size_bytes',
  help: 'Size of received emails in bytes',
  buckets: [1024, 5120, 10240, 51200, 102400, 524288, 1048576, 5242880],
});

// ---------------------------------------------------------------------------
// Forwarding metrics
// ---------------------------------------------------------------------------

const forwardingOtpRequestsTotal = new client.Counter({
  name: 'hidemail_forwarding_otp_requests_total',
  help: 'Total OTP verification requests',
});

const forwardingOtpVerificationsTotal = new client.Counter({
  name: 'hidemail_forwarding_otp_verifications_total',
  help: 'Total OTP verification attempts',
  labelNames: ['result'],
});

const forwardingEmailsTotal = new client.Counter({
  name: 'hidemail_forwarding_emails_total',
  help: 'Total email forwarding attempts',
  labelNames: ['result'],
});

// ---------------------------------------------------------------------------
// HTTP metrics
// ---------------------------------------------------------------------------

const httpRequestsTotal = new client.Counter({
  name: 'hidemail_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

const httpRequestDurationSeconds = new client.Histogram({
  name: 'hidemail_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

// ---------------------------------------------------------------------------
// Billing / subscription metrics
// ---------------------------------------------------------------------------

const billingCheckoutsTotal = new client.Counter({
  name: 'hidemail_billing_checkouts_total',
  help: 'Total WayForPay checkout sessions created',
  labelNames: ['type', 'plan'],
});

const billingWebhookEventsTotal = new client.Counter({
  name: 'hidemail_billing_webhook_events_total',
  help: 'Total WayForPay webhook callbacks by outcome',
  labelNames: ['result'],
});

const billingRevenueTotal = new client.Counter({
  name: 'hidemail_billing_revenue_total',
  help: 'Total confirmed subscription revenue in the smallest billed unit of the currency',
  labelNames: ['currency', 'type', 'plan'],
});

const licensesCreatedTotal = new client.Counter({
  name: 'hidemail_licenses_created_total',
  help: 'Total licenses issued after a first payment',
  labelNames: ['type', 'plan'],
});

const licensesRenewedTotal = new client.Counter({
  name: 'hidemail_licenses_renewed_total',
  help: 'Total licenses extended by a recurring payment',
  labelNames: ['type', 'plan'],
});

const licensesRevokedTotal = new client.Counter({
  name: 'hidemail_licenses_revoked_total',
  help: 'Total licenses revoked after a refund or chargeback',
  labelNames: ['type'],
});

const licenseValidationsTotal = new client.Counter({
  name: 'hidemail_license_validations_total',
  help: 'Total license key validations by outcome',
  labelNames: ['result'],
});

const apiKeyValidationsTotal = new client.Counter({
  name: 'hidemail_api_key_validations_total',
  help: 'Total API key validations by outcome',
  labelNames: ['result'],
});

const licensesActive = new client.Gauge({
  name: 'hidemail_licenses_active',
  help: 'Currently active licenses, counted from Redis',
  labelNames: ['type', 'plan'],
});

const apiKeysActive = new client.Gauge({
  name: 'hidemail_api_keys_active',
  help: 'Currently valid API keys, counted from Redis',
});

const billingOrders = new client.Gauge({
  name: 'hidemail_billing_orders',
  help: 'Orders still held in Redis, by status',
  labelNames: ['status'],
});

const billingCollectorLastSuccessTimestampSeconds = new client.Gauge({
  name: 'hidemail_billing_collector_last_success_timestamp_seconds',
  help: 'Unix timestamp of the last successful subscription gauge collection',
});

const billingCollectorErrorsTotal = new client.Counter({
  name: 'hidemail_billing_collector_errors_total',
  help: 'Total failed subscription gauge collections',
});

const billingFxUsdUah = new client.Gauge({
  name: 'hidemail_billing_fx_usd_uah',
  help: 'Last used WayForPay USD to UAH rate (hryvnia per 1 USD)',
});

const billingFxLastSuccessTimestampSeconds = new client.Gauge({
  name: 'hidemail_billing_fx_last_success_timestamp_seconds',
  help: 'Unix timestamp of the last successful WayForPay CURRENCY_RATES fetch',
});

const billingFxFetchErrorsTotal = new client.Counter({
  name: 'hidemail_billing_fx_fetch_errors_total',
  help: 'Total failed WayForPay CURRENCY_RATES fetches',
});

const billingFxCacheHitsTotal = new client.Counter({
  name: 'hidemail_billing_fx_cache_hits_total',
  help: 'Total FX cache hits by freshness',
  labelNames: ['freshness'],
});

// ---------------------------------------------------------------------------
// Redis connectivity gauge
// ---------------------------------------------------------------------------

const redisConnected = new client.Gauge({
  name: 'hidemail_redis_connected',
  help: 'Whether Redis is connected (1) or not (0)',
});

// ---------------------------------------------------------------------------
// Metrics HTTP server
// ---------------------------------------------------------------------------

let metricsServer = null;

const startMetricsServer = () => {
  metricsServer = http.createServer(async (req, res) => {
    if (req.url === '/metrics' && req.method === 'GET') {
      try {
        const metrics = await client.register.metrics();
        res.setHeader('Content-Type', client.register.contentType);
        res.end(metrics);
      } catch (err) {
        logger.error('Metrics: Failed to collect metrics', err);
        res.writeHead(500);
        res.end('Internal Server Error');
      }
      return;
    }

    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  metricsServer.listen(METRICS_PORT, '0.0.0.0', () => {
    logger.info(`Metrics server running on port ${METRICS_PORT}`);
  });

  return metricsServer;
};

const stopMetricsServer = () => {
  if (metricsServer) {
    metricsServer.close(() => {
      logger.info('Metrics server closed');
    });
  }
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // Server lifecycle
  startMetricsServer,
  stopMetricsServer,

  // Mailbox counters
  mailboxesRegisteredTotal,
  mailboxesRefreshedTotal,
  mailboxesDeactivatedTotal,

  // SMTP / Email counters
  smtpConnectionsTotal,
  smtpRecipientsAcceptedTotal,
  smtpRecipientsRejectedTotal,
  emailsReceivedTotal,
  emailsStoredTotal,
  emailsDroppedTotal,
  smtpErrorsTotal,
  emailSizeBytes,

  // Forwarding counters
  forwardingOtpRequestsTotal,
  forwardingOtpVerificationsTotal,
  forwardingEmailsTotal,

  // HTTP counters
  httpRequestsTotal,
  httpRequestDurationSeconds,

  // Billing counters
  billingCheckoutsTotal,
  billingWebhookEventsTotal,
  billingRevenueTotal,
  licensesCreatedTotal,
  licensesRenewedTotal,
  licensesRevokedTotal,
  licenseValidationsTotal,
  apiKeyValidationsTotal,
  billingCollectorErrorsTotal,
  billingFxFetchErrorsTotal,
  billingFxCacheHitsTotal,

  // Billing gauges
  licensesActive,
  apiKeysActive,
  billingOrders,
  billingCollectorLastSuccessTimestampSeconds,
  billingFxUsdUah,
  billingFxLastSuccessTimestampSeconds,

  // Gauges
  redisConnected,

  // prom-client register (for tests)
  register: client.register,
};
