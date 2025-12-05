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
   * @param {number} expirationSeconds - Expiration time in seconds
   */
  async registerMailbox(email, expirationSeconds = 1800) {
    try {
      const key = `${KEY_PREFIXES.ACTIVE_MAILBOX}${email}`;
      await redis.set(key, Date.now());
      await redis.expire(key, expirationSeconds);
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
   * @param {number} expirationSeconds - New expiration time in seconds
   * @returns {Promise<boolean>} - True if successful
   */
  async refreshMailbox(email, expirationSeconds = 1800) {
    try {
      const key = `${KEY_PREFIXES.ACTIVE_MAILBOX}${email}`;
      const exists = await redis.exists(key);
      
      if (exists) {
        await redis.expire(key, expirationSeconds);
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
      // Check if mailbox is active
      if (!(await this.isMailboxActive(recipient))) {
        logger.warn(`Attempted to store email for inactive mailbox: ${recipient}`);
        return false;
      }
      
      // Use the same key format as in getEmails
      const listKey = `emails:${recipient}`;
      const emailKey = `email:${recipient}:${email.id}`;
      
      // Store email ID in the list
      await redis.rpush(listKey, email.id);
      
      // Store the full email object as a separate key
      await redis.set(emailKey, JSON.stringify(email));
      
      // Set expiration to match mailbox expiration
      const mailboxKey = `${KEY_PREFIXES.ACTIVE_MAILBOX}${recipient}`;
      const ttl = await redis.ttl(mailboxKey);
      
      if (ttl > 0) {
        await redis.expire(listKey, ttl);
        await redis.expire(emailKey, ttl);
      }
      
      logger.info(`Email stored for: ${recipient}`);
      return true;
    } catch (error) {
      logger.error('Error storing email in Redis:', error);
      throw error;
    }
  },

  /**
   * Get all emails for a mailbox
   * @param {string} email - The email address
   * @returns {Promise<Array>} - Array of email objects
   */
  async getEmails(email) {
    try {
      const key = `emails:${email}`;
      const emailIds = await redis.lrange(key, 0, -1);
      
      if (!emailIds || emailIds.length === 0) {
        return [];
      }
      
      const emails = [];
      for (const id of emailIds) {
        const emailKey = `email:${email}:${id}`;
        const emailData = await redis.get(emailKey);
        
        if (emailData) {
          try {
            const email = JSON.parse(emailData);
            emails.push(email);
          } catch (e) {
            logger.error(`Failed to parse email data: ${e.message}`);
          }
        }
      }
      
      // Sort by receivedAt in descending order (newest first)
      return emails.sort((a, b) => {
        return new Date(b.receivedAt) - new Date(a.receivedAt);
      });
    } catch (error) {
      logger.error(`Error getting emails: ${error.message}`);
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