const express = require('express');
const emailController = require('../controllers/emailController');
const redisService = require('../services/redisService');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Email routes
router.get('/emails/:email', emailController.getEmails);
router.get('/emails/:email/:id', emailController.getEmailById);
router.delete('/emails/:email/:id', emailController.deleteEmail);
router.delete('/emails/:email', emailController.deleteAllEmails);

// Domain routes
router.get('/domains', emailController.getDomains);

// Mailbox routes
router.post('/mailbox/register', emailController.registerMailbox);
router.post('/mailbox/refresh', emailController.refreshMailbox);
router.post('/mailbox/deactivate', emailController.deactivateMailbox);

// Add the missing /messages endpoint
router.get('/messages', async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email parameter is required' 
      });
    }
    
    logger.info(`API: Fetching messages for email: ${email}`);
    
    // Check if mailbox exists
    const isMailboxActive = await redisService.isMailboxActive(email);
    if (!isMailboxActive) {
      logger.warn(`API: Mailbox not active for email: ${email}`);
      return res.status(404).json({ 
        success: false, 
        error: 'Mailbox not found or inactive' 
      });
    }
    
    // Get messages from Redis
    const messages = await redisService.getEmails(email);
    logger.info(`API: Found ${messages.length} messages for email: ${email}`);
    
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

// Debug endpoint to check Redis data (remove in production)
router.get('/debug/redis', async (req, res) => {
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

// Redis connection test endpoint
router.get('/debug/redis-connection', async (req, res) => {
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

// Test email endpoint
router.post('/test-email', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email parameter is required' 
      });
    }
    
    logger.info(`API: Sending test email to: ${email}`);
    
    // Check if mailbox exists
    const isMailboxActive = await redisService.isMailboxActive(email);
    if (!isMailboxActive) {
      logger.warn(`API: Mailbox not active for email: ${email}`);
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

// Test endpoint to check Redis key structure
router.get('/debug/redis-keys', async (req, res) => {
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

module.exports = router; 