const redisService = require('../services/redisService');
const config = require('../config/config');
const logger = require('../utils/logger');

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
   * Get available domains
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getDomains(req, res, next) {
    try {
      // Get domains from Redis
      const domains = await redisService.getDomains();
      
      return res.json({
        success: true,
        count: domains.length,
        data: domains
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
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async registerMailbox(req, res, next) {
    try {
      const { email } = req.body;
      
      // Validate email format
      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Invalid email address' });
      }
      
      // Extract domain from email
      const domain = email.split('@')[1];
      
      // Check if domain is valid
      const isDomainValid = await redisService.isDomainValid(domain);
      
      if (!isDomainValid) {
        return res.status(400).json({ error: 'Invalid domain' });
      }
      
      // Register mailbox with configured expiration time
      await redisService.registerMailbox(email, config.emailExpirationSeconds);
      
      res.status(200).json({
        success: true,
        message: 'Mailbox registered successfully',
        data: { email }
      });
    } catch (error) {
      logger.error('Error in registerMailbox controller:', error);
      next(error);
    }
  },
  
  /**
   * Refresh mailbox expiration
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async refreshMailbox(req, res, next) {
    try {
      const { email } = req.body;
      
      // Validate email format
      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Invalid email address' });
      }
      
      // Refresh mailbox with configured extension time
      const success = await redisService.refreshMailbox(email, config.emailExtensionSeconds);
      
      if (!success) {
        return res.status(404).json({ error: 'Mailbox not found or expired' });
      }
      
      res.status(200).json({
        success: true,
        message: 'Mailbox refreshed successfully'
      });
    } catch (error) {
      logger.error('Error in refreshMailbox controller:', error);
      next(error);
    }
  },
  
  /**
   * Deactivate a mailbox
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async deactivateMailbox(req, res, next) {
    try {
      const { email } = req.body;
      
      // Validate email format
      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Invalid email address' });
      }
      
      // Deactivate mailbox
      const success = await redisService.deactivateMailbox(email);
      
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