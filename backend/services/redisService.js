const Redis = require('ioredis');
const config = require('../config/config');
const logger = require('../utils/logger');
const { sanitizeEmail } = require('../utils/sanitize');

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
  // Known mailboxes persist after lease expiration
  // to silently drop emails instead of returning 550 errors
  KNOWN_MAILBOX: 'known_mailbox:',
};

// Grace period after mailbox expiration before full cleanup (configurable via env)
const getMailboxCleanupGraceSeconds = () => {
  return config.mailboxCleanupGraceDays * 24 * 60 * 60;
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
      const activeKey = `${KEY_PREFIXES.ACTIVE_MAILBOX}${email}`;
      const knownKey = `${KEY_PREFIXES.KNOWN_MAILBOX}${email}`;
      
      // Set active mailbox with standard expiration
      await redis.set(activeKey, Date.now());
      await redis.expire(activeKey, expirationSeconds);
      
      // Set known mailbox with extended grace period (configurable, default 7 days after lease expiration)
      // This prevents 550 errors which can lead to domain blocklisting
      const knownExpiration = expirationSeconds + getMailboxCleanupGraceSeconds();
      await redis.set(knownKey, Date.now());
      await redis.expire(knownKey, knownExpiration);
      
      logger.info(`Mailbox registered: ${sanitizeEmail(email)} (cleanup in ${knownExpiration}s)`);
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
   * Check if a mailbox was ever created by us (within grace period)
   * Used to accept emails without 550 errors even after lease expiration
   * @param {string} email - Email address
   * @returns {Promise<boolean>} - True if mailbox is known (created by us)
   */
  async isMailboxKnown(email) {
    try {
      const key = `${KEY_PREFIXES.KNOWN_MAILBOX}${email}`;
      return await redis.exists(key) === 1;
    } catch (error) {
      logger.error('Error checking if mailbox is known in Redis:', error);
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
      const activeKey = `${KEY_PREFIXES.ACTIVE_MAILBOX}${email}`;
      const knownKey = `${KEY_PREFIXES.KNOWN_MAILBOX}${email}`;
      const exists = await redis.exists(activeKey);
      
      if (exists) {
        // Refresh active mailbox TTL
        await redis.expire(activeKey, expirationSeconds);
        
        // Also refresh known mailbox TTL with grace period
        const knownExpiration = expirationSeconds + getMailboxCleanupGraceSeconds();
        await redis.expire(knownKey, knownExpiration);
        
        logger.info(`Mailbox refreshed: ${sanitizeEmail(email)}`);
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
        logger.warn(`Attempted to store email for inactive mailbox: ${sanitizeEmail(recipient)}`);
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
      
      logger.info(`Email stored for: ${sanitizeEmail(recipient)}`);
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
   * Get a specific email by ID
   * @param {string} email - Email address
   * @param {string} id - Email ID
   * @returns {Promise<Object|null>} - Email object or null
   */
  async getEmailById(email, id) {
    try {
      // Use the correct key format that matches storeEmail
      const emailKey = `email:${email}:${id}`;
      const emailData = await redis.get(emailKey);
      
      if (emailData) {
        try {
          const parsedEmail = JSON.parse(emailData);
          // Mark as read
          parsedEmail.read = true;
          // Update in Redis
          await redis.set(emailKey, JSON.stringify(parsedEmail));
          return parsedEmail;
        } catch (e) {
          logger.error(`Failed to parse email data: ${e.message}`);
          return null;
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
      logger.info(`All emails deleted for: ${sanitizeEmail(email)}`);
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
        logger.info(`Mailbox deactivated: ${sanitizeEmail(email)}`);
      } else {
        logger.warn(`Attempted to deactivate non-existent mailbox: ${sanitizeEmail(email)}`);
      }
      
      return true;
    } catch (error) {
      logger.error('Error deactivating mailbox in Redis:', error);
      throw error;
    }
  }
};

// Export the redis client for direct access by other services
redisService.client = redis;

module.exports = redisService; 