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
  environment: process.env.NODE_ENV || 'development',
  apiTimeout: parseInt(process.env.API_TIMEOUT || fileConfig.api?.timeout || 5000)
};

module.exports = config; 