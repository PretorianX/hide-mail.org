require('dotenv').config();

const config = {
  port: process.env.PORT || 3001,
  smtpPort: process.env.SMTP_PORT || 2525,
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  validDomains: process.env.VALID_DOMAINS 
    ? process.env.VALID_DOMAINS.split(',') 
    : ['mailduck.io', 'mail-duck.com', 'duckmail.org', 'quackbox.net', 'duckpost.com', 'mailpond.com', 'quackmail.net', 'duckbox.email'],
  emailExpiration: parseInt(process.env.EMAIL_EXPIRATION || 30), // In minutes
  environment: process.env.NODE_ENV || 'development'
};

module.exports = config; 