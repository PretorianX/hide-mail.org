const Redis = require('ioredis');
const config = require('../config/config');
const logger = require('../utils/logger');

// Create Redis client
const redis = new Redis(config.redisUrl);

// Handle Redis connection events
redis.on('connect', () => {
  logger.info('Connected to Redis');
});

redis.on('error', (err) => {
  logger.error('Redis error:', err);
});

// Key prefixes for better organization
const KEY_PREFIXES = {
  DOMAINS: 'domains',
  EMAIL: 'email:',
  ACTIVE_MAILBOX: 'active_mailbox:',
};

const redisService = {
  /**
   * Initialize Redis with domains
   * @param {Array} domains - List of valid domains
   */
  async initializeDomains(domains) {
    try {
      // Store domains in Redis
      await redis.del(KEY_PREFIXES.DOMAINS);
      if (domains && domains.length > 0) {
        await redis.sadd(KEY_PREFIXES.DOMAINS, ...domains);
      }
      logger.info('Domains initialized in Redis');
    } catch (error) {
      logger.error('Error initializing domains in Redis:', error);
      throw error;
    }
  },

  /**
   * Get all valid domains
   * @returns {Promise<Array>} - List of domains
   */
  async getDomains() {
    try {
      const domains = await redis.smembers(KEY_PREFIXES.DOMAINS);
      return domains;
    } catch (error) {
      logger.error('Error fetching domains from Redis:', error);
      throw error;
    }
  },

  /**
   * Check if a domain is valid
   * @param {string} domain - Domain to check
   * @returns {Promise<boolean>} - True if domain is valid
   */
  async isDomainValid(domain) {
    try {
      return await redis.sismember(KEY_PREFIXES.DOMAINS, domain);
    } catch (error) {
      logger.error('Error checking domain validity in Redis:', error);
      throw error;
    }
  },

  /**
   * Register an active mailbox
   * @param {string} email - Email address
   * @param {number} expirationMinutes - Expiration time in minutes
   */
  async registerMailbox(email, expirationMinutes = 30) {
    try {
      const key = `${KEY_PREFIXES.ACTIVE_MAILBOX}${email}`;
      await redis.set(key, Date.now());
      await redis.expire(key, expirationMinutes * 60); // Set expiration in seconds
      logger.info(`Mailbox registered: ${email}`);
    } catch (error) {
      logger.error('Error registering mailbox in Redis:', error);
      throw error;
    }
  },

  /**
   * Check if a mailbox is active
   * @param {string} email - Email address
   * @returns {Promise<boolean>} - True if mailbox is active
   */
  async isMailboxActive(email) {
    try {
      const key = `${KEY_PREFIXES.ACTIVE_MAILBOX}${email}`;
      return await redis.exists(key) === 1;
    } catch (error) {
      logger.error('Error checking mailbox activity in Redis:', error);
      throw error;
    }
  },

  /**
   * Refresh mailbox expiration time
   * @param {string} email - Email address
   * @param {number} expirationMinutes - New expiration time in minutes
   * @returns {Promise<boolean>} - True if successful
   */
  async refreshMailbox(email, expirationMinutes = 30) {
    try {
      const key = `${KEY_PREFIXES.ACTIVE_MAILBOX}${email}`;
      const exists = await redis.exists(key);
      
      if (exists) {
        await redis.expire(key, expirationMinutes * 60);
        logger.info(`Mailbox refreshed: ${email}`);
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Error refreshing mailbox in Redis:', error);
      throw error;
    }
  },

  /**
   * Store an email
   * @param {string} recipient - Email recipient
   * @param {Object} email - Email object
   */
  async storeEmail(recipient, email) {
    try {
      const key = `${KEY_PREFIXES.EMAIL}${recipient}`;
      
      // Check if mailbox is active
      if (!(await this.isMailboxActive(recipient))) {
        logger.warn(`Attempted to store email for inactive mailbox: ${recipient}`);
        return false;
      }
      
      // Store email as a list item
      await redis.rpush(key, JSON.stringify(email));
      
      // Set expiration to match mailbox expiration
      const mailboxKey = `${KEY_PREFIXES.ACTIVE_MAILBOX}${recipient}`;
      const ttl = await redis.ttl(mailboxKey);
      
      if (ttl > 0) {
        await redis.expire(key, ttl);
      }
      
      logger.info(`Email stored for: ${recipient}`);
      return true;
    } catch (error) {
      logger.error('Error storing email in Redis:', error);
      throw error;
    }
  },

  /**
   * Get all emails for a recipient
   * @param {string} email - Email address
   * @returns {Promise<Array>} - List of emails
   */
  async getEmails(email) {
    try {
      const key = `${KEY_PREFIXES.EMAIL}${email}`;
      const emails = await redis.lrange(key, 0, -1);
      
      return emails.map(item => JSON.parse(item));
    } catch (error) {
      logger.error('Error fetching emails from Redis:', error);
      throw error;
    }
  },

  /**
   * Get a specific email by index
   * @param {string} email - Email address
   * @param {string} id - Email ID
   * @returns {Promise<Object|null>} - Email object or null
   */
  async getEmailById(email, id) {
    try {
      const key = `${KEY_PREFIXES.EMAIL}${email}`;
      const emails = await redis.lrange(key, 0, -1);
      
      for (const item of emails) {
        const parsedEmail = JSON.parse(item);
        if (parsedEmail.id === id) {
          // Mark as read
          parsedEmail.read = true;
          
          // Update in Redis
          const index = emails.indexOf(item);
          await redis.lset(key, index, JSON.stringify(parsedEmail));
          
          return parsedEmail;
        }
      }
      
      return null;
    } catch (error) {
      logger.error('Error fetching email by ID from Redis:', error);
      throw error;
    }
  },

  /**
   * Delete an email by ID
   * @param {string} email - Email address
   * @param {string} id - Email ID
   * @returns {Promise<boolean>} - True if successful
   */
  async deleteEmail(email, id) {
    try {
      const key = `${KEY_PREFIXES.EMAIL}${email}`;
      const emails = await redis.lrange(key, 0, -1);
      
      for (const item of emails) {
        const parsedEmail = JSON.parse(item);
        if (parsedEmail.id === id) {
          // Remove from Redis
          await redis.lrem(key, 1, item);
          logger.info(`Email deleted: ${id}`);
          return true;
        }
      }
      
      return false;
    } catch (error) {
      logger.error('Error deleting email from Redis:', error);
      throw error;
    }
  },

  /**
   * Delete all emails for a recipient
   * @param {string} email - Email address
   * @returns {Promise<boolean>} - True if successful
   */
  async deleteAllEmails(email) {
    try {
      const key = `${KEY_PREFIXES.EMAIL}${email}`;
      await redis.del(key);
      logger.info(`All emails deleted for: ${email}`);
      return true;
    } catch (error) {
      logger.error('Error deleting all emails from Redis:', error);
      throw error;
    }
  },

  /**
   * Deactivate a mailbox
   * @param {string} email - Email address to deactivate
   * @returns {Promise<boolean>} - True if successful
   */
  async deactivateMailbox(email) {
    try {
      const key = `${KEY_PREFIXES.ACTIVE_MAILBOX}${email}`;
      
      // Check if mailbox exists
      const exists = await redis.exists(key);
      
      if (exists) {
        // Delete the key to deactivate
        await redis.del(key);
        logger.info(`Mailbox deactivated: ${email}`);
      } else {
        logger.warn(`Attempted to deactivate non-existent mailbox: ${email}`);
      }
      
      return true;
    } catch (error) {
      logger.error('Error deactivating mailbox in Redis:', error);
      throw error;
    }
  }
};

module.exports = redisService; 