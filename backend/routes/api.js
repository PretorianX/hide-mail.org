const express = require('express');
const emailController = require('../controllers/emailController');
const forwardingController = require('../controllers/forwardingController');
const redisService = require('../services/redisService');
const logger = require('../utils/logger');
const { sanitizeEmail } = require('../utils/sanitize');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/config');
const apiRateLimiter = require('../services/apiRateLimiter');
const powService = require('../services/powService');

const router = express.Router();

// Environment check for debug endpoints
const isDevelopment = () => config.environment === 'development';

// ============================================================================
// Proof of Work Challenge Endpoint
// Client must solve a challenge before registering mailboxes
// ============================================================================
router.get('/challenge', apiRateLimiter.default, powService.challengeHandler);

// Email routes (with rate limiting)
router.get('/emails/:email', apiRateLimiter.emailFetch, emailController.getEmails);
router.get('/emails/:email/:id', apiRateLimiter.emailFetch, emailController.getEmailById);
router.delete('/emails/:email/:id', apiRateLimiter.default, emailController.deleteEmail);
router.delete('/emails/:email', apiRateLimiter.default, emailController.deleteAllEmails);

// Domain routes
router.get('/domains', apiRateLimiter.default, emailController.getDomains);

// Mailbox routes (with rate limiting and PoW protection)
// In development: PoW is optional for easier testing
// In production: PoW is required to prevent automated abuse
router.post('/mailbox/register', 
  apiRateLimiter.mailboxRegister, 
  async (req, res, next) => {
    // Skip PoW in development if no pow data provided (for testing)
    if (isDevelopment() && !req.body?.pow) {
      logger.warn('PoW: Skipped in development mode');
      return next();
    }
    return powService.requireProofOfWork(req, res, next);
  },
  emailController.registerMailbox
);
router.post('/mailbox/refresh', apiRateLimiter.mailboxRefresh, emailController.refreshMailbox);
router.post('/mailbox/deactivate', apiRateLimiter.default, emailController.deactivateMailbox);

// Add the missing /messages endpoint (with rate limiting)
router.get('/messages', apiRateLimiter.emailFetch, async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email parameter is required' 
      });
    }
    
    logger.info(`API: Fetching messages for email: ${sanitizeEmail(email)}`);
    
    // Check if mailbox exists
    const isMailboxActive = await redisService.isMailboxActive(email);
    if (!isMailboxActive) {
      logger.warn(`API: Mailbox not active for email: ${sanitizeEmail(email)}`);
      return res.status(404).json({ 
        success: false, 
        error: 'Mailbox not found or inactive' 
      });
    }
    
    // Get messages from Redis
    const messages = await redisService.getEmails(email);
    logger.info(`API: Found ${messages.length} messages for email: ${sanitizeEmail(email)}`);
    
    return res.json({ 
      success: true, 
      messages: messages 
    });
  } catch (error) {
    logger.error(`API: Error fetching messages: ${error.message}`, error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch messages' 
    });
  }
});

// Debug endpoint to check Redis data - DEVELOPMENT ONLY
router.get('/debug/redis', apiRateLimiter.default, async (req, res) => {
  if (!isDevelopment()) {
    return res.status(404).json({ error: 'Not found' });
  }
  
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({ error: 'Email parameter is required' });
    }
    
    // Check if mailbox exists
    const isMailboxActive = await redisService.isMailboxActive(email);
    const emailsKey = `emails:${email}`;
    const emailIds = await redisService.client.lrange(emailsKey, 0, -1);
    
    // Get all keys in Redis for debugging
    const keys = await redisService.client.keys('*');
    
    return res.json({
      mailboxActive: isMailboxActive,
      emailIds: emailIds,
      allKeys: keys
    });
  } catch (error) {
    logger.error(`Debug endpoint error: ${error.message}`, error);
    return res.status(500).json({ error: 'Debug endpoint error' });
  }
});

// Redis connection test endpoint - DEVELOPMENT ONLY
router.get('/debug/redis-connection', apiRateLimiter.default, async (req, res) => {
  if (!isDevelopment()) {
    return res.status(404).json({ error: 'Not found' });
  }
  
  try {
    // Test Redis connection
    const pingResult = await redisService.client.ping();
    
    // Get Redis client info
    const redisInfo = {
      ping: pingResult,
      connected: redisService.client.connected || false,
      availableMethods: Object.keys(redisService.client).filter(key => typeof redisService.client[key] === 'function')
    };
    
    return res.json({
      success: true,
      redisInfo
    });
  } catch (error) {
    logger.error(`Redis connection test error: ${error.message}`, error);
    return res.status(500).json({ 
      success: false, 
      error: `Redis connection test failed: ${error.message}` 
    });
  }
});

// Test email endpoint - DEVELOPMENT ONLY
router.post('/test-email', apiRateLimiter.default, async (req, res) => {
  if (!isDevelopment()) {
    return res.status(404).json({ error: 'Not found' });
  }
  
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email parameter is required' 
      });
    }
    
    logger.info(`API: Sending test email to: ${sanitizeEmail(email)}`);
    
    // Check if mailbox exists
    const isMailboxActive = await redisService.isMailboxActive(email);
    if (!isMailboxActive) {
      logger.warn(`API: Mailbox not active for email: ${sanitizeEmail(email)}`);
      return res.status(404).json({ 
        success: false, 
        error: 'Mailbox not found or inactive' 
      });
    }
    
    // Create a test email
    const testEmail = {
      id: uuidv4(),
      from: '"Test System" <test@mailduck.io>',
      subject: 'Test Email - ' + new Date().toLocaleString(),
      preview: 'This is a test email sent from the Mail Duck system.',
      text: 'This is a test email sent from the Mail Duck system.\n\nIt contains multiple lines of text to test the email display functionality.\n\nBegin nature main church. Admit total very really stock. Whose Congress interview factor.\nClose Mr three put first democratic. Money few agree politics break movement either agree.',
      html: '<div><p>This is a test email sent from the <strong>Mail Duck</strong> system.</p><p>It contains multiple lines of text to test the email display functionality.</p><p>Begin nature main church. Admit total very really stock. Whose Congress interview factor.</p><p>Close Mr three put first democratic. Money few agree politics break movement either agree.</p></div>',
      body: `MIME-Version: 1.0
Content-Type: multipart/alternative;
	boundary="b1_test"
Content-Transfer-Encoding: 8bit

This is a multi-part message in MIME format.
--b1_test
Content-Type: text/plain; charset=utf-8
Content-Transfer-Encoding: 8bit

This is a test email sent from the Mail Duck system.

It contains multiple lines of text to test the email display functionality.

Begin nature main church. Admit total very really stock. Whose Congress interview factor.
Close Mr three put first democratic. Money few agree politics break movement either agree.

--b1_test
Content-Type: text/html; charset=utf-8
Content-Transfer-Encoding: 8bit

<html>
<body>
<div>
<p>This is a test email sent from the <strong>Mail Duck</strong> system.</p>
<p>It contains multiple lines of text to test the email display functionality.</p>
<p>Begin nature main church. Admit total very really stock. Whose Congress interview factor.</p>
<p>Close Mr three put first democratic. Money few agree politics break movement either agree.</p>
</div>
</body>
</html>
--b1_test--`,
      attachments: [],
      receivedAt: new Date().toISOString(),
      date: new Date().toISOString(),
      read: false
    };
    
    // Store the test email
    await redisService.storeEmail(email, testEmail);
    
    return res.json({ 
      success: true, 
      message: 'Test email sent successfully' 
    });
  } catch (error) {
    logger.error(`API: Error sending test email: ${error.message}`, error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to send test email' 
    });
  }
});

// Test endpoint to check Redis key structure - DEVELOPMENT ONLY
router.get('/debug/redis-keys', apiRateLimiter.default, async (req, res) => {
  if (!isDevelopment()) {
    return res.status(404).json({ error: 'Not found' });
  }
  
  try {
    // Get all keys in Redis
    const allKeys = await redisService.client.keys('*');
    
    // Group keys by prefix
    const keysByPrefix = {};
    allKeys.forEach(key => {
      const prefix = key.split(':')[0];
      if (!keysByPrefix[prefix]) {
        keysByPrefix[prefix] = [];
      }
      keysByPrefix[prefix].push(key);
    });
    
    return res.json({
      success: true,
      totalKeys: allKeys.length,
      keysByPrefix
    });
  } catch (error) {
    logger.error(`Redis keys test error: ${error.message}`, error);
    return res.status(500).json({ 
      success: false, 
      error: `Redis keys test failed: ${error.message}` 
    });
  }
});

// ============================================================================
// Forward & Forget Routes
// Privacy-focused email forwarding with OTP validation
// ============================================================================

// Request OTP for destination email validation (rate limited - critical for email sending)
// POST /api/forwarding/request-otp
// Body: { tempMailbox: "user@domain.com", destinationEmail: "real@email.com" }
router.post('/forwarding/request-otp', apiRateLimiter.mailboxRegister, forwardingController.requestOTP);

// Verify OTP and activate forwarding
// POST /api/forwarding/verify-otp
// Body: { tempMailbox: "user@domain.com", destinationEmail: "real@email.com", otp: "123456" }
router.post('/forwarding/verify-otp', apiRateLimiter.default, forwardingController.verifyOTP);

// Forward a specific message to validated destination (rate limited)
// POST /api/forwarding/forward/:email/:messageId
router.post('/forwarding/forward/:email/:messageId', apiRateLimiter.default, forwardingController.forwardMessage);

// Get forwarding status (destination, rate limit, etc.)
// GET /api/forwarding/status/:email
router.get('/forwarding/status/:email', apiRateLimiter.default, forwardingController.getForwardingStatus);

// Clear forwarding configuration
// DELETE /api/forwarding/:email
router.delete('/forwarding/:email', apiRateLimiter.default, forwardingController.clearForwarding);

module.exports = router; 