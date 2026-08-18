/**
 * QA REST API (separate tariff, license type `api`).
 * Authenticate with Authorization: Bearer <api-key> issued for an API license.
 * Pricing is not billed yet — keys are issued for type=api licenses.
 *
 * POST   /api/qa/mailboxes
 * GET    /api/qa/mailboxes/:email/messages
 * GET    /api/qa/mailboxes/:email/messages/:id
 * PUT    /api/qa/mailboxes/:email/webhook
 */

const crypto = require('crypto');
const config = require('../config/config');
const redisService = require('../services/redisService');
const entitlementService = require('../services/entitlementService');
const { validatePublicHttpsWebhookUrl } = require('../services/webhookUrlGuard');
const logger = require('../utils/logger');

const randomLocalPart = () => `qa${crypto.randomBytes(6).toString('hex')}`;

const allowedDomainsForLicense = (license) => {
  const domains = [...config.validDomains];
  if (license && config.premiumDomains.length > 0) {
    config.premiumDomains.forEach((domain) => {
      if (!domains.includes(domain)) {
        domains.push(domain);
      }
    });
  }
  return domains;
};

const createMailbox = async (req, res, next) => {
  try {
    const domains = allowedDomainsForLicense(req.apiLicense);
    const requestedDomain = req.body?.domain;
    const domain = requestedDomain && domains.includes(requestedDomain)
      ? requestedDomain
      : domains[0];

    if (!domain) {
      return res.status(500).json({ success: false, error: 'No domains configured' });
    }

    const alias = req.body?.alias;
    const localPart = alias || randomLocalPart();
    const email = `${localPart}@${domain}`;
    const ttl = entitlementService.resolveMailboxTtl(req.apiLicense, req.body?.ttlSeconds);

    await redisService.registerMailbox(email, ttl);
    await redisService.setMailboxMeta(email, {
      licenseKey: req.apiLicense.key,
      alias: Boolean(alias),
    }, ttl);

    return res.status(201).json({
      success: true,
      data: { email, ttlSeconds: ttl },
    });
  } catch (error) {
    logger.error('QA createMailbox error', error);
    return next(error);
  }
};

const listMessages = async (req, res, next) => {
  try {
    const { email } = req.params;
    const active = await redisService.isMailboxActive(email);
    if (!active) {
      return res.status(404).json({ success: false, error: 'Mailbox not found' });
    }
    const messages = await redisService.getEmails(email);
    return res.status(200).json({ success: true, data: messages });
  } catch (error) {
    logger.error('QA listMessages error', error);
    return next(error);
  }
};

const getMessage = async (req, res, next) => {
  try {
    const { email, id } = req.params;
    const message = await redisService.getEmailById(email, id);
    if (!message) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }
    return res.status(200).json({ success: true, data: message });
  } catch (error) {
    logger.error('QA getMessage error', error);
    return next(error);
  }
};

const setWebhook = async (req, res, next) => {
  try {
    const { email } = req.params;
    const { url } = req.body || {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Valid public HTTPS webhook URL is required',
        code: 'INVALID_WEBHOOK_URL',
      });
    }
    try {
      await validatePublicHttpsWebhookUrl(url);
    } catch {
      return res.status(400).json({
        success: false,
        error: 'Valid public HTTPS webhook URL is required',
        code: 'INVALID_WEBHOOK_URL',
      });
    }
    const active = await redisService.isMailboxActive(email);
    if (!active) {
      return res.status(404).json({ success: false, error: 'Mailbox not found' });
    }
    await redisService.setMailboxWebhook(email, url);
    return res.status(200).json({ success: true, data: { url } });
  } catch (error) {
    logger.error('QA setWebhook error', error);
    return next(error);
  }
};

const deleteMailbox = async (req, res, next) => {
  try {
    const { email } = req.params;
    await redisService.deactivateMailbox(email);
    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error('QA deleteMailbox error', error);
    return next(error);
  }
};

module.exports = {
  createMailbox,
  listMessages,
  getMessage,
  setWebhook,
  deleteMailbox,
};
