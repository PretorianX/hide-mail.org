require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { SMTPServer } = require('smtp-server');
const { simpleParser } = require('mailparser');
const redisService = require('./services/redisService');
const forwardingService = require('./services/forwardingService');
const config = require('./config/config');
const logger = require('./utils/logger');
const apiRoutes = require('./routes/api');
const { createOriginVerifier, parseAllowedOrigins } = require('./services/originVerifier');

const app = express();
const PORT = process.env.PORT || 3001;
const SMTP_PORT = process.env.SMTP_PORT || 2525;

// Initialize Redis with domains and Forward & Forget service
(async () => {
  try {
    await redisService.initializeDomains(config.validDomains);
    logger.info('Redis initialized with domains');
    
    // Initialize Forward & Forget service
    forwardingService.initialize();
  } catch (error) {
    logger.error('Failed to initialize services:', error);
  }
})();

// Parse allowed origins from environment
const allowedOrigins = parseAllowedOrigins();
const isDev = config.environment === 'development';

// Development localhost origins
const devOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
];

// CORS configuration with origin verification
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, etc.) only in dev
    if (!origin) {
      if (isDev) {
        return callback(null, true);
      }
      // In production, block requests without origin for API routes
      return callback(null, false);
    }
    
    const normalizedOrigin = origin.toLowerCase();
    
    // Check configured origins
    const isAllowedOrigin = allowedOrigins.some(allowed => {
      if (allowed === normalizedOrigin) return true;
      if (allowed.startsWith('*.')) {
        const baseDomain = allowed.slice(2);
        return normalizedOrigin.endsWith(baseDomain);
      }
      return false;
    });
    
    // Allow development origins
    const isDevOrigin = isDev && devOrigins.includes(normalizedOrigin);
    
    if (isAllowedOrigin || isDevOrigin) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('CORS not allowed'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Length', 'Content-Type', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204,
  maxAge: 86400 // 24 hours
};

// Middleware
app.use(cors(corsOptions));

app.use(express.json());
app.use(morgan('dev'));

// Origin verification middleware for API routes
// Blocks requests from unauthorized origins
const originVerifier = createOriginVerifier({ 
  allowDevelopment: true,
  strict: !isDev // Only strict in production
});

// Routes with origin verification
app.use('/api', originVerifier, apiRoutes);

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
        
        // If SMTP_UNKNOWN_MAILBOX_CODE=250, accept ALL emails for valid domains
        // This is the safest mode for domain reputation (catch-all with silent drop)
        const responseCode = config.smtpUnknownMailboxCode;
        if (responseCode === 250) {
          logger.info(`SMTP: Catch-all mode - accepting all emails for valid domain: ${address.address}`);
          return callback();
        }
        
        // Check if mailbox is known (created by us, within grace period)
        // We accept emails for any known mailbox to avoid 550 errors
        // which can lead to domain blocklisting
        const isMailboxKnown = await redisService.isMailboxKnown(address.address);
        
        if (!isMailboxKnown) {
          // Reject with configured code (450=temp fail, 550=permanent fail)
          logger.warn(`SMTP: Rejecting unknown mailbox ${address.address} with code ${responseCode}`);
          const err = new Error(`Unknown recipient: ${address.address}`);
          err.responseCode = responseCode;
          return callback(err);
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
    
    stream.on('data', (chunk) => {
      mailData += chunk;
    });

    stream.on('end', async () => {
      try {
        logger.info(`SMTP: Finished receiving message data (${mailData.length} bytes)`);
        
        // Extract recipient from session
        const recipient = session.envelope.rcptTo[0].address;
        logger.info(`SMTP: Processing email for recipient: ${recipient}`);
        
        // Check if mailbox is active - only store emails for active mailboxes
        // All other cases (expired, unknown in catch-all mode) are silently dropped
        const isMailboxActive = await redisService.isMailboxActive(recipient);
        
        if (!isMailboxActive) {
          // Silently drop emails for inactive/unknown mailboxes
          // We already accepted the email in onRcptTo to avoid 550 errors
          const isCatchAll = config.smtpUnknownMailboxCode === 250;
          const reason = isCatchAll ? 'catch-all mode' : 'expired mailbox';
          logger.info(`SMTP: Silently dropping email for ${reason}: ${recipient}`);
          callback(); // Return 250 OK to sender
          return;
        }
        
        // Parse email
        const parsedMail = await simpleParser(mailData);
        
        // Store the full raw email body for debugging
        const rawBody = mailData;
        
        // Serialize attachments with base64 content for JSON storage
        const serializableAttachments = (parsedMail.attachments || []).map(att => ({
          filename: att.filename || 'attachment',
          contentType: att.contentType || 'application/octet-stream',
          contentDisposition: att.contentDisposition || 'attachment',
          cid: att.cid || null, // Content-ID for inline images
          size: att.size || 0,
          content: att.content ? att.content.toString('base64') : null,
          encoding: 'base64', // Mark that content is base64 encoded
        }));
        
        // Store email
        const email = {
          id: require('uuid').v4(),
          from: parsedMail.from?.text || 'unknown',
          subject: parsedMail.subject || '(No Subject)',
          preview: parsedMail.text ? parsedMail.text.substring(0, 100) : '(No content)',
          text: parsedMail.text || '',
          html: parsedMail.html || '',
          body: rawBody, // Store the full raw email
          attachments: serializableAttachments,
          receivedAt: new Date().toISOString(),
          date: parsedMail.date ? new Date(parsedMail.date).toISOString() : new Date().toISOString(),
          read: false
        };
        
        logger.debug(`SMTP: Storing email with ID: ${email.id}`);
        await redisService.storeEmail(recipient, email);
        
        // Log success with more details
        logger.info(`SMTP: Email successfully processed and stored for: ${recipient}`);
        logger.info(`SMTP: Email ID: ${email.id}, Subject: ${email.subject}`);
        
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