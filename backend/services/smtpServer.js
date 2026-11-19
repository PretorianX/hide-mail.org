const { SMTPServer } = require('smtp-server');
const defaultRedisService = require('./redisService');
const defaultInboundMailService = require('./inboundMailService');
const { resolveKnownRecipient: defaultResolveKnownRecipient } = require('./recipientResolver');
const { shouldAcceptOutboundBounceRcpt: defaultShouldAcceptOutboundBounceRcpt } = require('./outbound/inboundBounceRcpt');
const defaultMetrics = require('./metricsService');
const defaultConfig = require('../config/config');
const defaultLogger = require('../utils/logger');

const smtpError = (message, responseCode) => {
  const err = new Error(message);
  err.responseCode = responseCode;
  return err;
};

/**
 * Create and configure the inbound SMTPServer with size, timeout, recipient, and per-IP limits.
 *
 * @param {Object} [options] - Optional overrides for config, services, or smtp-server options
 * @returns {SMTPServer}
 */
const createSmtpServer = (options = {}) => {
  const cfg = options.config || defaultConfig;
  const redisService = options.redisService || defaultRedisService;
  const inboundMailService = options.inboundMailService || defaultInboundMailService;
  const resolveKnownRecipient = options.resolveKnownRecipient || defaultResolveKnownRecipient;
  const shouldAcceptOutboundBounceRcpt =
    options.shouldAcceptOutboundBounceRcpt || defaultShouldAcceptOutboundBounceRcpt;
  const metrics = options.metrics || defaultMetrics;
  const logger = options.logger || defaultLogger;

  const smtpCfg = {
    ...cfg.smtpInbound,
    ...(options.smtpInbound || {}),
  };

  const activeByIp = new Map();
  const rateByIp = new Map();

  const cleanupRateEntry = (now) => {
    if (rateByIp.size <= 1000) return;
    for (const [ip, entry] of rateByIp.entries()) {
      if (now >= entry.resetAt) {
        rateByIp.delete(ip);
      }
    }
  };

  const smtpServer = new SMTPServer({
    secure: false,
    authOptional: true,
    disabledCommands: ['AUTH'],
    logger: options.smtpLogger !== undefined ? options.smtpLogger : true,
    size: smtpCfg.maxMessageBytes,
    socketTimeout: smtpCfg.socketTimeoutMs,
    closeTimeout: options.closeTimeout || 5000,
    maxClients: smtpCfg.maxClients,

    onConnect(session, callback) {
      const ip = session.remoteAddress || 'unknown';
      const now = Date.now();
      cleanupRateEntry(now);

      const active = activeByIp.get(ip) || 0;
      if (active >= smtpCfg.maxConnectionsPerIp) {
        logger.warn(`SMTP: Rejected connection from ${ip}: too many concurrent connections (${active})`);
        metrics.smtpErrorsTotal.inc();
        return callback(smtpError('Too many concurrent connections from your IP', 421));
      }

      let rateEntry = rateByIp.get(ip);
      if (!rateEntry || now >= rateEntry.resetAt) {
        rateEntry = { count: 0, resetAt: now + smtpCfg.rateLimitWindowMs };
        rateByIp.set(ip, rateEntry);
      }
      rateEntry.count += 1;
      if (rateEntry.count > smtpCfg.rateLimitMaxPerIp) {
        logger.warn(`SMTP: Rate-limited connection from ${ip} (${rateEntry.count} in window)`);
        metrics.smtpErrorsTotal.inc();
        return callback(smtpError('Too many connections, try again later', 421));
      }

      activeByIp.set(ip, active + 1);
      session._trackedIp = ip;
      logger.info(`SMTP: New connection from ${ip}`);
      metrics.smtpConnectionsTotal.inc();
      return callback();
    },

    onClose(session) {
      const ip = session._trackedIp;
      if (!ip) return;
      const active = activeByIp.get(ip) || 0;
      if (active <= 1) {
        activeByIp.delete(ip);
      } else {
        activeByIp.set(ip, active - 1);
      }
      delete session._trackedIp;
    },

    onMailFrom(address, session, callback) {
      logger.info(`SMTP: MAIL FROM: ${address.address}`);
      callback();
    },

    onRcptTo(address, session, callback) {
      (async () => {
        try {
          logger.info(`SMTP: RCPT TO: ${address.address}`);

          if (session.envelope.rcptTo.length >= smtpCfg.maxRecipients) {
            logger.warn(`SMTP: Rejected recipient ${address.address}: max recipients (${smtpCfg.maxRecipients}) reached`);
            metrics.smtpRecipientsRejectedTotal.inc({ reason: 'too_many_recipients' });
            return callback(smtpError('Too many recipients', 452));
          }

          // Late outbound DSN mail-back (b-<id>@hm-bounce.<domain> or return-path target)
          if (shouldAcceptOutboundBounceRcpt(address.address)) {
            logger.info(`SMTP: Accepted outbound bounce recipient: ${address.address}`);
            metrics.smtpRecipientsAcceptedTotal.inc();
            return callback();
          }

          // Extract domain from email
          const domain = address.address.split('@')[1];

          // Check if domain is valid
          const isDomainValid = await redisService.isDomainValid(domain);

          if (!isDomainValid) {
            logger.warn(`SMTP: Rejected email to ${address.address}: invalid domain`);
            metrics.smtpRecipientsRejectedTotal.inc({ reason: 'invalid_domain' });
            return callback(new Error(`Invalid domain: ${domain}`));
          }

          // If SMTP_UNKNOWN_MAILBOX_CODE=250, accept ALL emails for valid domains
          // This is the safest mode for domain reputation (catch-all with silent drop)
          const responseCode = cfg.smtpUnknownMailboxCode;
          if (responseCode === 250) {
            logger.info(`SMTP: Catch-all mode - accepting all emails for valid domain: ${address.address}`);
            metrics.smtpRecipientsAcceptedTotal.inc();
            return callback();
          }

          // Accept anything routing to a mailbox we created and that is still inside the grace
          // period — including its site addresses — to avoid 550 errors, which can lead to
          // domain blocklisting.
          const knownRoute = await resolveKnownRecipient(address.address);

          if (!knownRoute) {
            logger.warn(`SMTP: Rejecting unknown mailbox ${address.address} with code ${responseCode}`);
            metrics.smtpRecipientsRejectedTotal.inc({ reason: 'unknown_mailbox' });
            return callback(smtpError(`Unknown recipient: ${address.address}`, responseCode));
          }

          logger.info(`SMTP: Accepted recipient: ${address.address}`);
          metrics.smtpRecipientsAcceptedTotal.inc();
          return callback();
        } catch (error) {
          logger.error(`SMTP: Error in onRcptTo: ${error.message}`, error);
          metrics.smtpErrorsTotal.inc();
          return callback(new Error(`Error processing recipient: ${error.message}`));
        }
      })();
    },

    onData(stream, session, callback) {
      logger.info('SMTP: Starting to receive message data');

      const chunks = [];
      let totalBytes = 0;
      let aborted = false;
      let settled = false;

      const finish = (err) => {
        if (settled) return;
        settled = true;
        callback(err);
      };

      stream.on('data', (chunk) => {
        if (aborted) return;

        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalBytes += buf.length;

        if (stream.sizeExceeded || totalBytes > smtpCfg.maxMessageBytes) {
          aborted = true;
          chunks.length = 0;
          logger.warn(`SMTP: Rejecting oversize message mid-stream (${totalBytes} > ${smtpCfg.maxMessageBytes} bytes)`);
          metrics.smtpErrorsTotal.inc();
          finish(smtpError(`Message size exceeds fixed maximum message size (${smtpCfg.maxMessageBytes} bytes)`, 552));
          return;
        }

        chunks.push(buf);
      });

      stream.on('end', async () => {
        if (aborted || settled) return;

        try {
          const mailData = Buffer.concat(chunks, totalBytes).toString('utf8');
          chunks.length = 0;

          logger.info(`SMTP: Finished receiving message data (${totalBytes} bytes)`);
          metrics.emailsReceivedTotal.inc();
          metrics.emailSizeBytes.observe(totalBytes);

          const seen = new Set();
          const recipients = [];
          for (const rcpt of session.envelope.rcptTo || []) {
            const addr = String(rcpt.address || '').trim();
            const key = addr.toLowerCase();
            if (addr && !seen.has(key)) {
              seen.add(key);
              recipients.push(addr);
            }
          }

          if (recipients.length === 0) {
            return finish(smtpError('No valid recipients in envelope', 554));
          }

          const results = await Promise.allSettled(
            recipients.map(async (recipient) => {
              logger.info(`SMTP: Processing email for recipient: ${recipient}`);
              return inboundMailService.deliverInboundMessage({ recipient, rawBody: mailData });
            })
          );

          let succeeded = 0;
          let firstError = null;
          results.forEach((outcome, idx) => {
            const recipient = recipients[idx];
            if (outcome.status === 'fulfilled') {
              succeeded += 1;
              const info = outcome.value || {};
              logger.info(
                `SMTP: Recipient ${recipient} processed (delivered=${Boolean(info.delivered)}, reason=${info.reason || 'ok'})`
              );
            } else {
              if (!firstError) firstError = outcome.reason;
              metrics.smtpErrorsTotal.inc();
              logger.error(`SMTP: Error processing recipient ${recipient}: ${outcome.reason?.message}`, outcome.reason);
            }
          });

          if (succeeded === 0 && firstError) {
            return finish(new Error(`Error processing email: ${firstError.message}`));
          }

          finish();
        } catch (error) {
          logger.error(`SMTP: Error processing email: ${error.message}`, error);
          metrics.smtpErrorsTotal.inc();
          finish(new Error(`Error processing email: ${error.message}`));
        }
      });

      stream.on('error', (error) => {
        chunks.length = 0;
        logger.error(`SMTP: Stream error: ${error.message}`, error);
        if (!aborted) {
          metrics.smtpErrorsTotal.inc();
          finish(error);
        }
      });
    },
  });

  return smtpServer;
};

module.exports = {
  createSmtpServer,
};
