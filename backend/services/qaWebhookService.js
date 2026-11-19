const https = require('node:https');
const logger = require('../utils/logger');
const redisService = require('./redisService');
const {
  validatePublicHttpsWebhookUrl,
  createPinnedLookup,
} = require('./webhookUrlGuard');

const DEFAULT_TIMEOUT_MS = Number(process.env.QA_WEBHOOK_TIMEOUT_MS) || 5000;
const DEFAULT_MAX_CONCURRENCY = Number(process.env.QA_WEBHOOK_MAX_CONCURRENCY) || 20;

let inFlightCount = 0;

const postWithPinnedHttps = (url, body, { timeoutMs, lookupFn, signal, httpsImpl = https }) =>
  new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return reject(new Error('Invalid webhook URL'));
    }

    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
      return reject(new Error('Invalid webhook URL'));
    }

    const req = httpsImpl.request(
      parsed,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body, 'utf8'),
        },
        lookup: createPinnedLookup(lookupFn),
        timeout: timeoutMs,
        signal,
      },
      (res) => {
        // Do not follow redirects; drain and discard body within the same timeout signal.
        res.resume();
        if (res.statusCode >= 300 && res.statusCode < 400) {
          req.destroy(new Error(`Webhook redirect rejected (${res.statusCode})`));
          return;
        }
        res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode }));
        res.on('error', reject);
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error(`Webhook request timed out after ${timeoutMs}ms`));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });

const notifyMailboxWebhook = async (email, message, fetchImpl, options = {}) => {
  const url = await redisService.getMailboxWebhook(email);
  if (!url) {
    return false;
  }

  const maxConcurrency = options.maxConcurrency || DEFAULT_MAX_CONCURRENCY;
  if (inFlightCount >= maxConcurrency) {
    logger.warn(`QA webhook concurrency limit (${maxConcurrency}) reached; dropping notification for ${email}`);
    return false;
  }

  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`Webhook request timed out after ${timeoutMs}ms`));
  }, timeoutMs);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  const payload = JSON.stringify({
    mailbox: email,
    message: {
      id: message.id,
      from: message.from,
      subject: message.subject,
      receivedAt: message.receivedAt,
    },
  });

  inFlightCount += 1;
  try {
    if (fetchImpl) {
      await validatePublicHttpsWebhookUrl(url, options.lookupFn);
      await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        redirect: 'error',
        signal: controller.signal,
      });
    } else {
      await postWithPinnedHttps(url, payload, {
        timeoutMs,
        lookupFn: options.lookupFn,
        signal: controller.signal,
        httpsImpl: options.httpsImpl,
      });
    }
    return true;
  } catch (error) {
    logger.error(`QA webhook delivery failed for ${email}: ${error.message}`);
    return false;
  } finally {
    clearTimeout(timer);
    inFlightCount = Math.max(0, inFlightCount - 1);
  }
};

module.exports = {
  notifyMailboxWebhook,
  postWithPinnedHttps,
};
