require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Load configuration from JSON files
const loadConfig = () => {
  const env = process.env.NODE_ENV || 'development';
  let config = {};
  
  try {
    // Try to load environment-specific config
    const configPath = path.join(__dirname, '..', '..', 'config', `${env}.json`);
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
    
    // Load default config and merge
    const defaultConfigPath = path.join(__dirname, '..', '..', 'config', 'default.json');
    if (fs.existsSync(defaultConfigPath)) {
      const defaultConfig = JSON.parse(fs.readFileSync(defaultConfigPath, 'utf8'));
      config = { ...defaultConfig, ...config };
    }
  } catch (error) {
    console.error('Error loading config files:', error);
  }
  
  return config;
};

// Load config from files
const fileConfig = loadConfig();

// Get email domains from environment variable
const getEmailDomains = () => {
  if (!process.env.VALID_DOMAINS) {
    throw new Error('Email domains not configured. Set VALID_DOMAINS environment variable.');
  }
  
  return process.env.VALID_DOMAINS.split(',').map(domain => domain.trim());
};

// Final config with environment variables taking precedence
// All time values are in seconds for consistency
const config = {
  port: process.env.PORT || 3001,
  smtpPort: process.env.SMTP_PORT || 2525,
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  validDomains: getEmailDomains(),
  emailExpirationSeconds: parseInt(process.env.EMAIL_EXPIRATION_SECONDS || fileConfig.email?.expirationTime || 1800),
  emailExtensionSeconds: parseInt(process.env.EMAIL_EXTENSION_SECONDS || fileConfig.email?.extensionTime || 900),
  // Grace period before expired mailboxes are fully cleaned up
  // Emails are silently dropped during this period to avoid 550 errors (prevents blocklisting)
  mailboxCleanupGraceDays: parseInt(process.env.MAILBOX_CLEANUP_GRACE_DAYS || 7),
  // SMTP response code for unknown mailboxes (550=reject, 450=temp fail, 250=accept & drop)
  smtpUnknownMailboxCode: parseInt(process.env.SMTP_UNKNOWN_MAILBOX_CODE || 550),
  environment: process.env.NODE_ENV || 'development',
  apiTimeout: parseInt(process.env.API_TIMEOUT || fileConfig.api?.timeout || 5000),

  // SMTP Configuration for Forward & Forget feature
  // Used for sending OTP verification emails and forwarding emails
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_OUTGOING_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    fromEmail: process.env.SMTP_FROM_EMAIL || 'noreply@mailduck.io',
    fromName: process.env.SMTP_FROM_NAME || 'Mail Duck',
  },

  // DKIM Configuration for email signing
  // Improves deliverability of forwarded emails
  dkim: {
    domain: process.env.DKIM_DOMAIN || '',
    selector: process.env.DKIM_SELECTOR || 'default',
    privateKey: process.env.DKIM_PRIVATE_KEY || '',
  },

  // SRS (Sender Rewriting Scheme) Configuration
  // Required for proper SPF alignment when forwarding emails
  srs: {
    domain: process.env.SRS_DOMAIN || '',
    secret: process.env.SRS_SECRET || '',
  },

  // Forwarding Configuration
  forwarding: {
    rateLimit: parseInt(process.env.FORWARDING_RATE_LIMIT || 10), // Max forwards per hour
    otpExpirationMinutes: parseInt(process.env.OTP_EXPIRATION_MINUTES || 15),
    otpLength: parseInt(process.env.OTP_LENGTH || 6),
  },
};

module.exports = config; 