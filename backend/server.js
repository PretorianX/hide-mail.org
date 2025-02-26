require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { SMTPServer } = require('smtp-server');
const { simpleParser } = require('mailparser');
const redisService = require('./services/redisService');
const config = require('./config/config');
const logger = require('./utils/logger');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3001;
const SMTP_PORT = process.env.SMTP_PORT || 2525;

// Initialize Redis with domains
(async () => {
  try {
    await redisService.initializeDomains(config.validDomains);
    logger.info('Redis initialized with domains');
  } catch (error) {
    logger.error('Failed to initialize Redis with domains:', error);
  }
})();

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Routes
app.use('/api', apiRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(`Error: ${err.message}`);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal Server Error'
    }
  });
});

// Start Express server
const server = app.listen(PORT, () => {
  logger.info(`API server running on port ${PORT}`);
});

// Setup SMTP server to catch emails
const smtpServer = new SMTPServer({
  secure: false,
  authOptional: true,
  disabledCommands: ['AUTH'],
  logger: true, // Enable built-in logging
  
  // Log all SMTP events
  onConnect(session, callback) {
    logger.info(`SMTP: New connection from ${session.remoteAddress}`);
    callback();
  },
  
  onMailFrom(address, session, callback) {
    logger.info(`SMTP: MAIL FROM: ${address.address}`);
    callback();
  },
  
  onRcptTo(address, session, callback) {
    (async () => {
      try {
        logger.info(`SMTP: RCPT TO: ${address.address}`);
        
        // Extract domain from email
        const domain = address.address.split('@')[1];
        
        // Check if domain is valid
        const isDomainValid = await redisService.isDomainValid(domain);
        
        if (!isDomainValid) {
          logger.warn(`SMTP: Rejected email to ${address.address}: invalid domain`);
          return callback(new Error(`Invalid domain: ${domain}`));
        }
        
        // Check if mailbox is active
        const isMailboxActive = await redisService.isMailboxActive(address.address);
        
        if (!isMailboxActive) {
          logger.warn(`SMTP: Rejected email to ${address.address}: inactive mailbox`);
          return callback(new Error(`Mailbox not active: ${address.address}`));
        }
        
        logger.info(`SMTP: Accepted recipient: ${address.address}`);
        return callback(); // Accept the recipient
      } catch (error) {
        logger.error(`SMTP: Error in onRcptTo: ${error.message}`, error);
        return callback(new Error(`Error processing recipient: ${error.message}`));
      }
    })();
  },
  
  onData(stream, session, callback) {
    logger.info(`SMTP: Starting to receive message data`);
    
    let mailData = '';
    let dataLength = 0;
    
    stream.on('data', (chunk) => {
      mailData += chunk;
      dataLength += chunk.length;
      
      // Log progress for large emails
      if (dataLength % 10240 === 0) { // Log every 10KB
        logger.debug(`SMTP: Received ${dataLength} bytes of data`);
      }
    });

    stream.on('end', async () => {
      try {
        logger.info(`SMTP: Finished receiving message data (${dataLength} bytes)`);
        
        // Parse email
        logger.debug('SMTP: Parsing email data');
        const parsedMail = await simpleParser(mailData);
        
        // Log email details
        logger.info(`SMTP: Parsed email from: ${parsedMail.from?.text || 'unknown'}`);
        logger.info(`SMTP: Parsed email subject: ${parsedMail.subject || '(No Subject)'}`);
        
        // Extract recipient from session
        const recipient = session.envelope.rcptTo[0].address;
        logger.info(`SMTP: Processing email for recipient: ${recipient}`);
        
        // Check if mailbox is active
        const isActive = await redisService.isMailboxActive(recipient);
        
        if (!isActive) {
          logger.warn(`SMTP: Rejected email for inactive mailbox: ${recipient}`);
          return callback(new Error('Mailbox not active'));
        }
        
        // Store email
        const email = {
          id: require('uuid').v4(),
          from: parsedMail.from?.text || 'unknown',
          subject: parsedMail.subject || '(No Subject)',
          preview: parsedMail.text ? parsedMail.text.substring(0, 100) : '(No content)',
          text: parsedMail.text || '',
          html: parsedMail.html || '',
          attachments: parsedMail.attachments || [],
          receivedAt: new Date().toISOString(),
          read: false
        };
        
        logger.debug(`SMTP: Storing email with ID: ${email.id}`);
        await redisService.storeEmail(recipient, email);
        
        logger.info(`SMTP: Email successfully processed for: ${recipient}`);
        callback();
      } catch (error) {
        logger.error(`SMTP: Error processing email: ${error.message}`, error);
        callback(new Error(`Error processing email: ${error.message}`));
      }
    });
    
    stream.on('error', (error) => {
      logger.error(`SMTP: Stream error: ${error.message}`, error);
    });
  }
});

smtpServer.on('error', (err) => {
  logger.error(`SMTP server error: ${err.message}`, err);
});

smtpServer.listen(SMTP_PORT, () => {
  logger.info(`SMTP server running on port ${SMTP_PORT}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('HTTP server closed');
  });
  smtpServer.close(() => {
    logger.info('SMTP server closed');
    process.exit(0);
  });
});

module.exports = { app, server, smtpServer }; 