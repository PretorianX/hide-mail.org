/**
 * Origin Verification Middleware
 * 
 * Verifies that API requests come from allowed origins.
 * Protects against direct API access from unauthorized clients.
 * 
 * Checks both Origin and Referer headers for browser requests.
 * Allows configured origins and optionally localhost for development.
 */

const logger = require('../utils/logger');
const config = require('../config/config');

/**
 * Parse allowed origins from environment
 * @returns {string[]} Array of allowed origin URLs
 */
const parseAllowedOrigins = () => {
  const originsStr = process.env.ALLOWED_ORIGINS || '';
  
  if (!originsStr.trim()) {
    logger.warn('ALLOWED_ORIGINS not configured - origin verification disabled');
    return [];
  }
  
  return originsStr
    .split(',')
    .map(origin => origin.trim().toLowerCase())
    .filter(origin => origin.length > 0);
};

/**
 * Check if origin matches allowed patterns
 * @param {string} origin - Origin to check
 * @param {string[]} allowedOrigins - List of allowed origins
 * @returns {boolean}
 */
const isOriginAllowed = (origin, allowedOrigins) => {
  if (!origin) return false;
  
  const normalizedOrigin = origin.toLowerCase();
  
  return allowedOrigins.some(allowed => {
    // Exact match
    if (allowed === normalizedOrigin) return true;
    
    // Wildcard subdomain match (e.g., *.example.com)
    if (allowed.startsWith('*.')) {
      const baseDomain = allowed.slice(2);
      return normalizedOrigin.endsWith(baseDomain) || 
             normalizedOrigin === `https://${baseDomain}` ||
             normalizedOrigin === `http://${baseDomain}`;
    }
    
    return false;
  });
};

/**
 * Extract origin from Referer header
 * @param {string} referer - Referer header value
 * @returns {string|null} Origin URL or null
 */
const extractOriginFromReferer = (referer) => {
  if (!referer) return null;
  
  try {
    const url = new URL(referer);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
};

/**
 * Create origin verification middleware
 * @param {Object} options - Configuration options
 * @param {boolean} options.allowDevelopment - Allow localhost in development
 * @param {boolean} options.strict - Reject if no Origin/Referer header present
 * @returns {Function} Express middleware
 */
const createOriginVerifier = (options = {}) => {
  const { 
    allowDevelopment = true, 
    strict = true 
  } = options;
  
  const allowedOrigins = parseAllowedOrigins();
  const isDev = config.environment === 'development';
  
  // Development localhost patterns
  const devOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
  ];
  
  // If no origins configured, log warning and skip verification
  if (allowedOrigins.length === 0 && !isDev) {
    logger.warn('No ALLOWED_ORIGINS configured - requests will be blocked in production');
  }
  
  return (req, res, next) => {
    // Skip verification for health checks
    if (req.path === '/health') {
      return next();
    }
    
    // Get origin from headers
    const origin = req.headers.origin;
    const referer = req.headers.referer;
    const requestOrigin = origin || extractOriginFromReferer(referer);
    
    // Skip for non-browser requests (no Origin/Referer) in non-strict mode
    if (!requestOrigin && !strict) {
      return next();
    }
    
    // Check if origin is allowed
    let isAllowed = false;
    
    // Check configured origins
    if (allowedOrigins.length > 0 && isOriginAllowed(requestOrigin, allowedOrigins)) {
      isAllowed = true;
    }
    
    // Allow localhost in development
    if (allowDevelopment && isDev && devOrigins.includes(requestOrigin)) {
      isAllowed = true;
    }
    
    // Block if no origin header and strict mode
    if (!requestOrigin && strict) {
      logger.warn(`Origin verification failed: no Origin/Referer header from ${req.ip} for ${req.method} ${req.path}`);
      return res.status(403).json({
        success: false,
        error: 'Request origin not provided',
        code: 'ORIGIN_REQUIRED',
      });
    }
    
    if (!isAllowed) {
      logger.warn(`Origin verification failed: ${requestOrigin} not allowed for ${req.method} ${req.path}`);
      return res.status(403).json({
        success: false,
        error: 'Request origin not allowed',
        code: 'ORIGIN_NOT_ALLOWED',
      });
    }
    
    next();
  };
};

module.exports = {
  createOriginVerifier,
  parseAllowedOrigins,
  isOriginAllowed,
  extractOriginFromReferer,
};
