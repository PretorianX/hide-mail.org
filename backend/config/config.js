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

const parseDomainList = (value) => {
  if (!value || !value.trim()) {
    return [];
  }
  return value.split(',').map(domain => domain.trim()).filter(Boolean);
};

const parsePositiveNumber = (raw, fallback, name) => {
  const parsed = Number(raw === undefined || raw === '' ? fallback : raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive finite number`);
  }
  return parsed;
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
    rateLimit: parseInt(process.env.FORWARDING_RATE_LIMIT || 10), // legacy hourly cap
    freeLimit: parseInt(process.env.FORWARDING_FREE_LIMIT || 2), // teaser forwards per mailbox
    proLimit: parseInt(process.env.FORWARDING_PRO_LIMIT || 100), // Pro forwards per mailbox lifetime
    otpExpirationMinutes: parseInt(process.env.OTP_EXPIRATION_MINUTES || 15),
    otpLength: parseInt(process.env.OTP_LENGTH || 6),
  },

  // Premium domains are Pro-only. Empty list means Pro uses VALID_DOMAINS.
  premiumDomains: parseDomainList(process.env.PREMIUM_DOMAINS),

  // WayForPay is the only payment processor. Paddle can be added later; leave PADDLE_* unset.
  wayforpay: {
    merchantAccount: process.env.WAYFORPAY_MERCHANT_ACCOUNT || '',
    secretKey: process.env.WAYFORPAY_SECRET_KEY || '',
    domainName: process.env.WAYFORPAY_DOMAIN_NAME || '',
    serviceUrl: process.env.WAYFORPAY_SERVICE_URL || '',
    returnUrl: process.env.WAYFORPAY_RETURN_URL || '',
  },

  billing: {
    // WayForPay credits this merchant in hryvnia only; USD in env is the list price.
    currency: 'UAH',
    monthlyUsd: parsePositiveNumber(process.env.PRO_PRICE_MONTHLY_USD, '3.49', 'PRO_PRICE_MONTHLY_USD'),
    yearlyUsd: parsePositiveNumber(process.env.PRO_PRICE_YEARLY_USD, '24.99', 'PRO_PRICE_YEARLY_USD'),
    apiUsd: parsePositiveNumber(process.env.API_PRICE_MONTHLY_USD, '7.99', 'API_PRICE_MONTHLY_USD'),
    fxCacheSeconds: parsePositiveNumber(process.env.FX_CACHE_SECONDS, 7200, 'FX_CACHE_SECONDS'),
    fxStaleSeconds: parsePositiveNumber(process.env.FX_STALE_SECONDS, 86400, 'FX_STALE_SECONDS'),
    monthlyTtlSeconds: parseInt(process.env.PRO_LICENSE_MONTHLY_SECONDS || 30 * 24 * 60 * 60, 10),
    yearlyTtlSeconds: parseInt(process.env.PRO_LICENSE_YEARLY_SECONDS || 366 * 24 * 60 * 60, 10),
    apiKeyTtlSeconds: parseInt(process.env.API_KEY_TTL_SECONDS || 30 * 24 * 60 * 60, 10),
    // The order reference travels in the WayForPay return URL, so the window in which that
    // reference can hand out the license key is much shorter than the order's own lifetime.
    keyHandoffSeconds: parseInt(process.env.LICENSE_KEY_HANDOFF_SECONDS || 60 * 60, 10),
  },

  pro: {
    mailboxTtlOptions: {
      '24h': parseInt(process.env.PRO_TTL_24H || 86400, 10),
      '7d': parseInt(process.env.PRO_TTL_7D || 604800, 10),
      '30d': parseInt(process.env.PRO_TTL_30D || 2592000, 10),
    },
    defaultMailboxTtlSeconds: parseInt(process.env.PRO_TTL_24H || 86400, 10),
  },

  metrics: {
    // Subscription gauges are recomputed by scanning Redis, so this is deliberately much
    // coarser than the Prometheus scrape interval.
    billingCollectorIntervalSeconds: parseInt(
      process.env.BILLING_METRICS_INTERVAL_SECONDS || 60,
      10
    ),
  },
};

module.exports = config; 