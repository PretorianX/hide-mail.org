const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

// In-memory storage for emails (replace with a database in production)
const emailStorage = {};

// Email expiration time in milliseconds (30 minutes)
const EMAIL_EXPIRATION = 30 * 60 * 1000;

// Clean up expired emails periodically
setInterval(() => {
  const now = Date.now();
  
  Object.keys(emailStorage).forEach(email => {
    // Filter out expired messages
    emailStorage[email] = emailStorage[email].filter(msg => {
      return now - new Date(msg.receivedAt).getTime() < EMAIL_EXPIRATION;
    });
    
    // Remove email address if no messages left
    if (emailStorage[email].length === 0) {
      delete emailStorage[email];
    }
  });
  
  logger.info('Cleaned up expired emails');
}, 5 * 60 * 1000); // Run every 5 minutes

const emailService = {
  /**
   * Store an email for a recipient
   * @param {string} recipient - Email address of the recipient
   * @param {Object} parsedMail - Parsed email object from mailparser
   * @returns {Promise<Object>} - Stored email object
   */
  async storeEmail(recipient, parsedMail) {
    try {
      if (!emailStorage[recipient]) {
        emailStorage[recipient] = [];
      }
      
      // Extract relevant information from the parsed email
      const email = {
        id: uuidv4(),
        from: parsedMail.from.text,
        subject: parsedMail.subject || '(No Subject)',
        preview: parsedMail.text ? parsedMail.text.substring(0, 100) : '(No content)',
        text: parsedMail.text || '',
        html: parsedMail.html || '',
        attachments: parsedMail.attachments || [],
        receivedAt: new Date().toISOString(),
        read: false
      };
      
      // Add email to storage
      emailStorage[recipient].push(email);
      
      return email;
    } catch (error) {
      logger.error('Error storing email:', error);
      throw new Error('Failed to store email');
    }
  },
  
  /**
   * Get all emails for a recipient
   * @param {string} email - Email address to fetch messages for
   * @returns {Promise<Array>} - Array of email objects
   */
  async getEmails(email) {
    try {
      return emailStorage[email] || [];
    } catch (error) {
      logger.error('Error fetching emails:', error);
      throw new Error('Failed to fetch emails');
    }
  },
  
  /**
   * Get a specific email by ID
   * @param {string} email - Recipient email address
   * @param {string} id - Email ID
   * @returns {Promise<Object|null>} - Email object or null if not found
   */
  async getEmailById(email, id) {
    try {
      if (!emailStorage[email]) return null;
      
      const foundEmail = emailStorage[email].find(msg => msg.id === id);
      
      if (foundEmail) {
        // Mark as read
        foundEmail.read = true;
      }
      
      return foundEmail || null;
    } catch (error) {
      logger.error('Error fetching email by ID:', error);
      throw new Error('Failed to fetch email');
    }
  },
  
  /**
   * Delete an email by ID
   * @param {string} email - Recipient email address
   * @param {string} id - Email ID
   * @returns {Promise<boolean>} - Success status
   */
  async deleteEmail(email, id) {
    try {
      if (!emailStorage[email]) return false;
      
      const initialLength = emailStorage[email].length;
      emailStorage[email] = emailStorage[email].filter(msg => msg.id !== id);
      
      return initialLength > emailStorage[email].length;
    } catch (error) {
      logger.error('Error deleting email:', error);
      throw new Error('Failed to delete email');
    }
  },
  
  /**
   * Delete all emails for a recipient
   * @param {string} email - Recipient email address
   * @returns {Promise<boolean>} - Success status
   */
  async deleteAllEmails(email) {
    try {
      if (!emailStorage[email]) return false;
      
      delete emailStorage[email];
      return true;
    } catch (error) {
      logger.error('Error deleting all emails:', error);
      throw new Error('Failed to delete all emails');
    }
  }
};

module.exports = emailService; 