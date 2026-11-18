const winston = require('winston');

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const REDACTED_EMAIL = '[redacted-email]';

function redactEmailStrings(value, seen = new WeakSet()) {
  if (typeof value === 'string') {
    return value.replace(EMAIL_PATTERN, REDACTED_EMAIL);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  if (seen.has(value)) {
    return value;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => redactEmailStrings(item, seen));
  }
  if (value instanceof Error) {
    return value;
  }
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = redactEmailStrings(v, seen);
  }
  return out;
}

const redactEmailsFormat = winston.format((info) => {
  const redacted = redactEmailStrings(info);
  for (const sym of Object.getOwnPropertySymbols(info)) {
    redacted[sym] = info[sym];
  }
  return redacted;
});

// Custom format for better readability
const customFormat = winston.format.printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;
  
  // Add metadata if present
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  
  return msg;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    redactEmailsFormat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'mailduck-backend' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss'
        }),
        customFormat
      )
    })
  ]
});

// Add file transport in production with bounded rotation
if (process.env.NODE_ENV === 'production') {
  logger.add(new winston.transports.File({ 
    filename: 'logs/error.log', 
    level: 'error',
    maxsize: 10 * 1024 * 1024,
    maxFiles: 5,
    tailable: true,
    format: winston.format.combine(
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
      }),
      winston.format.json()
    )
  }));
  
  logger.add(new winston.transports.File({ 
    filename: 'logs/combined.log',
    maxsize: 10 * 1024 * 1024,
    maxFiles: 5,
    tailable: true,
    format: winston.format.combine(
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
      }),
      winston.format.json()
    )
  }));
}

// Create a stream object for Morgan
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  }
};

module.exports = logger; 