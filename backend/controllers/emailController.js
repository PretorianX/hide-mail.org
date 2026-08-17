const redisService = require('../services/redisService');
const config = require('../config/config');
const logger = require('../utils/logger');
const metrics = require('../services/metricsService');
const entitlementService = require('../services/entitlementService');

const ALIAS_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;

const allKnownDomains = () => {
  const domains = [...config.validDomains];
  config.premiumDomains.forEach((domain) => {
    if (!domains.includes(domain)) {
      domains.push(domain);
    }
  });
  return domains;
};

const isPremiumOnlyDomain = (domain) =>
  config.premiumDomains.includes(domain) && !config.validDomains.includes(domain);

const emailController = {
  /**
   * Get all emails for a recipient
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getEmails(req, res, next) {
    try {
      const { email } = req.params;
      
      // Validate email format
      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Invalid email address' });
      }
      
      const emails = await redisService.getEmails(email);
      
      res.status(200).json({
        success: true,
        data: emails
      });
    } catch (error) {
      logger.error('Error in getEmails controller:', error);
      next(error);
    }
  },
  
  /**
   * Get a specific email by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getEmailById(req, res, next) {
    try {
      const { email, id } = req.params;
      
      // Validate email format
      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Invalid email address' });
      }
      
      // Validate ID
      if (!id) {
        return res.status(400).json({ error: 'Email ID is required' });
      }
      
      const foundEmail = await redisService.getEmailById(email, id);
      
      if (!foundEmail) {
        return res.status(404).json({ error: 'Email not found' });
      }
      
      res.status(200).json({
        success: true,
        data: foundEmail
      });
    } catch (error) {
      logger.error('Error in getEmailById controller:', error);
      next(error);
    }
  },
  
  /**
   * Delete an email by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async deleteEmail(req, res, next) {
    try {
      const { email, id } = req.params;
      
      // Validate email format
      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Invalid email address' });
      }
      
      // Validate ID
      if (!id) {
        return res.status(400).json({ error: 'Email ID is required' });
      }
      
      const success = await redisService.deleteEmail(email, id);
      
      if (!success) {
        return res.status(404).json({ error: 'Email not found' });
      }
      
      res.status(200).json({
        success: true,
        message: 'Email deleted successfully'
      });
    } catch (error) {
      logger.error('Error in deleteEmail controller:', error);
      next(error);
    }
  },
  
  /**
   * Delete all emails for a recipient
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async deleteAllEmails(req, res, next) {
    try {
      const { email } = req.params;
      
      // Validate email format
      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Invalid email address' });
      }
      
      await redisService.deleteAllEmails(email);
      
      res.status(200).json({
        success: true,
        message: 'All emails deleted successfully'
      });
    } catch (error) {
      logger.error('Error in deleteAllEmails controller:', error);
      next(error);
    }
  },
  
  /**
   * Get available domains. Premium domains are included only with a valid Pro license.
   * If PREMIUM_DOMAINS is empty, Pro sees VALID_DOMAINS only.
   */
  async getDomains(req, res, next) {
    try {
      const entitlements = entitlementService.getEntitlements(req.license);
      const premium = entitlements.premiumDomains ? [...config.premiumDomains] : [];
      const data = entitlements.premiumDomains ? allKnownDomains() : [...config.validDomains];

      return res.json({
        success: true,
        count: data.length,
        data,
        premium,
      });
    } catch (error) {
      logger.error('Error fetching domains:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch domains'
      });
    }
  },
  
  /**
   * Register a new mailbox
   */
  async registerMailbox(req, res, next) {
    try {
      const { email, alias, customAlias, ttlSeconds, mailboxTtlSeconds } = req.body;
      const entitlements = req.entitlements || entitlementService.getEntitlements(req.license);
      const wantsAlias = Boolean(alias || customAlias);
      
      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Invalid email address' });
      }

      if (wantsAlias) {
        if (!entitlements.customAlias) {
          return res.status(403).json({
            success: false,
            error: 'Custom aliases require Hide Mail Pro',
            code: 'PRO_REQUIRED',
          });
        }
        const localPart = email.split('@')[0].toLowerCase();
        const requestedAlias = String(alias || customAlias).toLowerCase();
        if (!ALIAS_PATTERN.test(localPart) || (alias && localPart !== requestedAlias)) {
          return res.status(400).json({ error: 'Invalid alias' });
        }
      }
      
      const domain = email.split('@')[1];
      if (!allKnownDomains().includes(domain)) {
        return res.status(400).json({ error: 'Invalid domain' });
      }

      if (isPremiumOnlyDomain(domain) && !entitlements.premiumDomains) {
        return res.status(403).json({
          success: false,
          error: 'Premium domains require Hide Mail Pro',
          code: 'PREMIUM_DOMAIN',
        });
      }

      if (await redisService.isMailboxActive(email)) {
        return res.status(409).json({
          success: false,
          error: 'This address is already in use. Choose another alias, or keep a private one with Hide Mail Pro.',
          code: 'ALIAS_TAKEN',
        });
      }
      
      const expirationSeconds = entitlementService.resolveMailboxTtl(
        req.license,
        Number(ttlSeconds || mailboxTtlSeconds)
      );
      await redisService.registerMailbox(email, expirationSeconds);
      if (req.license) {
        await redisService.setMailboxMeta(email, {
          licenseKey: req.license.key,
          alias: wantsAlias,
        }, expirationSeconds);
      }
      metrics.mailboxesRegisteredTotal.inc();
      
      res.status(200).json({
        success: true,
        message: 'Mailbox registered successfully',
        data: { email, ttlSeconds: expirationSeconds }
      });
    } catch (error) {
      logger.error('Error in registerMailbox controller:', error);
      next(error);
    }
  },
  
  /**
   * Refresh mailbox expiration
   */
  async refreshMailbox(req, res, next) {
    try {
      const { email, ttlSeconds } = req.body;
      
      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Invalid email address' });
      }

      const expirationSeconds = entitlementService.resolveMailboxTtl(req.license, requestedTtl);
      const success = await redisService.refreshMailbox(email, expirationSeconds);
      
      if (!success) {
        return res.status(404).json({ error: 'Mailbox not found or expired' });
      }
      
      metrics.mailboxesRefreshedTotal.inc();
      res.status(200).json({
        success: true,
        message: 'Mailbox refreshed successfully',
        data: { ttlSeconds: expirationSeconds }
      });
    } catch (error) {
      logger.error('Error in refreshMailbox controller:', error);
      next(error);
    }
  },
  
  /**
   * Deactivate a mailbox
   */
  async deactivateMailbox(req, res, next) {
    try {
      const { email } = req.body;
      
      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Invalid email address' });
      }
      
      await redisService.deactivateMailbox(email);
      metrics.mailboxesDeactivatedTotal.inc();
      
      res.status(200).json({
        success: true,
        message: 'Mailbox deactivated successfully'
      });
    } catch (error) {
      logger.error('Error in deactivateMailbox controller:', error);
      next(error);
    }
  }
};

module.exports = emailController;
