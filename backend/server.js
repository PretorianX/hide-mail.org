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

// CORS configuration
const corsOptions = {
  origin: '*', // Allow all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204,
  maxAge: 86400 // 24 hours
};

// Middleware
app.use(cors(corsOptions));

// Add custom CORS middleware for additional control
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  next();
});

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

// Add this to your backend server.js file for debugging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
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
    
    stream.on('data', (chunk) => {
      mailData += chunk;
    });

    stream.on('end', async () => {
      try {
        logger.info(`SMTP: Finished receiving message data (${mailData.length} bytes)`);
        
        // Parse email
        const parsedMail = await simpleParser(mailData);
        
        // Extract recipient from session
        const recipient = session.envelope.rcptTo[0].address;
        logger.info(`SMTP: Processing email for recipient: ${recipient}`);
        
        // Store the full raw email body for debugging
        const rawBody = mailData;
        
        // Store email
        const email = {
          id: require('uuid').v4(),
          from: parsedMail.from?.text || 'unknown',
          subject: parsedMail.subject || '(No Subject)',
          preview: parsedMail.text ? parsedMail.text.substring(0, 100) : '(No content)',
          text: parsedMail.text || '',
          html: parsedMail.html || '',
          body: rawBody, // Store the full raw email
          attachments: parsedMail.attachments || [],
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