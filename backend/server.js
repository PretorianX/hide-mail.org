require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { createSmtpServer } = require('./services/smtpServer');
const redisService = require('./services/redisService');
const forwardingService = require('./services/forwardingService');
const dnsRecheckJob = require('./services/outbound/dnsRecheckJob');
const eventConsumer = require('./services/outbound/eventConsumer');
const metrics = require('./services/metricsService');
const billingMetricsCollector = require('./services/billingMetricsCollector');
const httpMetricsMiddleware = require('./middleware/httpMetrics');
const { applyBodyParsers } = require('./middleware/bodyParsers');
const { errorHandler } = require('./middleware/errorHandler');
const config = require('./config/config');
const logger = require('./utils/logger');
const apiRoutes = require('./routes/api');
const mcpRoutes = require('./routes/mcp');
const openApiRoutes = require('./routes/openApi');
const adminRoutes = require('./routes/admin');
const outboundRoutes = require('./routes/outbound');
const billingController = require('./controllers/billingController');
const attachLicense = require('./middleware/attachLicense');
const { createOriginVerifier, parseAllowedOrigins, isOriginAllowed } = require('./services/originVerifier');
const { randomUUID } = require('node:crypto');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);
const PORT = process.env.PORT || 3001;
const SMTP_PORT = process.env.SMTP_PORT || 2525;

// Initialize Redis with domains and Forward & Forget service
(async () => {
  try {
    const allDomains = [...new Set([...config.validDomains, ...config.premiumDomains])];
    await redisService.initializeDomains(allDomains);
    logger.info('Redis initialized with domains');
    
    // Initialize Forward & Forget service
    forwardingService.initialize();
    dnsRecheckJob.start();
    eventConsumer.start();
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
      return callback(null, true);
    }
    
    const normalizedOrigin = origin.toLowerCase();
    
    // Check configured origins
    const allowed = isOriginAllowed(normalizedOrigin, allowedOrigins);
    
    // Allow development origins
    const isDevOrigin = isDev && devOrigins.includes(normalizedOrigin);
    
    if (allowed || isDevOrigin) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked origin: ${origin}`);
      const err = new Error('CORS not allowed');
      err.status = 403;
      err.code = 'ORIGIN_NOT_ALLOWED';
      callback(err);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'X-License-Key', 'X-Api-Key'],
  exposedHeaders: ['Content-Length', 'Content-Type', 'Content-Disposition', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204,
  maxAge: 86400 // 24 hours
};

// WayForPay returns the payer with a cross-site form POST, so the browser attaches their Origin
// and the CORS check below would answer 500. This is a navigation rather than an XHR: nothing
// cross-origin reads the response, which is only a redirect to the Pro page. It reads the order
// reference from the query string, so it also needs no parsed body.
app.all('/api/billing/return', billingController.customerReturn);

// Middleware
app.use((req, res, next) => {
  req.correlationId = req.get('x-correlation-id') || randomUUID();
  res.setHeader('x-correlation-id', req.correlationId);
  next();
});
app.use(cors(corsOptions));
app.use(httpMetricsMiddleware);

applyBodyParsers(app);
app.use(morgan('dev'));

// WayForPay server callbacks have no browser Origin — verify HMAC instead.
app.post('/api/billing/webhook', billingController.webhook);

// Origin verification middleware for API routes
// Blocks requests from unauthorized origins
const originVerifier = createOriginVerifier({ 
  allowDevelopment: true,
  strict: !isDev // Only strict in production
});

// Routes with origin verification
app.use('/api/mcp', mcpRoutes);
app.use('/api', openApiRoutes);
app.use('/api/outbound', outboundRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', originVerifier, attachLicense, apiRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Error handling middleware
app.use(errorHandler);

// Start Express server
const server = app.listen(PORT, () => {
  logger.info(`API server running on port ${PORT}`);
});

// Start Prometheus metrics server
metrics.startMetricsServer();
billingMetricsCollector.start();

// Setup SMTP server to catch emails
const smtpServer = createSmtpServer();

smtpServer.on('error', (err) => {
  logger.error(`SMTP server error: ${err.message}`, err);
});

smtpServer.listen(SMTP_PORT, () => {
  logger.info(`SMTP server running on port ${SMTP_PORT}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  billingMetricsCollector.stop();
  metrics.stopMetricsServer();
  server.close(() => {
    logger.info('HTTP server closed');
  });
  smtpServer.close(() => {
    logger.info('SMTP server closed');
    process.exit(0);
  });
});

module.exports = { app, server, smtpServer }; 