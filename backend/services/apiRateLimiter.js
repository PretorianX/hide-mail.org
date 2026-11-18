/**
 * API Rate Limiter Middleware
 * 
 * General-purpose rate limiting for API endpoints.
 * Uses Redis for distributed rate limiting.
 * 
 * Protects against:
 * - Brute force attacks
 * - DoS attacks
 * - Resource exhaustion
 */

const logger = require('../utils/logger');
const { sanitizeIP } = require('../utils/sanitize');
const redisService = require('./redisService');

// Rate limit configurations per endpoint type
const RATE_LIMITS = {
  // Mailbox registration: 10 per minute per IP (prevent mass mailbox creation)
  mailboxRegister: { requests: 10, windowSeconds: 60 },
  // Mailbox refresh: 30 per minute per IP
  mailboxRefresh: { requests: 30, windowSeconds: 60 },
  // Email fetching: 60 per minute per IP
  emailFetch: { requests: 60, windowSeconds: 60 },
  // License restore: 10 per 5 minutes per IP (a license key is a bearer credential)
  licenseValidate: { requests: 10, windowSeconds: 300, failClosed: true },
  // Admin login: strict IP + account limit with exponential backoff and fail-closed on Redis errors
  adminLogin: { requests: 5, windowSeconds: 300, failClosed: true, backoff: true },
  // Order lookup after payment: separate bucket so guessing license keys cannot lock a
  // paying customer out of collecting the key they just bought
  orderLookup: { requests: 20, windowSeconds: 300 },
  // Default: 100 per minute per IP
  default: { requests: 100, windowSeconds: 60 },
  // Free in-browser Mail Grade reports. Tight enough to discourage scraping the page.
  gradeReport: { requests: 20, windowSeconds: 600 },
  // Paid Mail Grade API. A sender's pipeline buys this limit, not the free page.
  mailGrade: { requests: 120, windowSeconds: 60 },
  // Free in-browser Sender Check lookups. Each one asks DNS.
  senderReport: { requests: 15, windowSeconds: 600 },
  // Paid Sender Check API.
  senderCheck: { requests: 60, windowSeconds: 60 },
  // Free in-browser DMARC report reads.
  reportsRead: { requests: 20, windowSeconds: 600 },
  // Paid DMARC Reports API. A monitoring job buys this limit, not the free page.
  dmarcReports: { requests: 60, windowSeconds: 60 },
  // Free in-browser Bounce Read reports.
  bounceReport: { requests: 20, windowSeconds: 600 },
  // Paid Bounce Read API.
  bounceRead: { requests: 120, windowSeconds: 60 },
  // Free in-browser Complaint Read reports.
  complaintReport: { requests: 20, windowSeconds: 600 },
  // Paid Complaint Read API.
  complaintRead: { requests: 120, windowSeconds: 60 },
  // Free in-browser TLS Reports reads.
  tlsReport: { requests: 20, windowSeconds: 600 },
  // Paid TLS Reports API.
  tlsRead: { requests: 120, windowSeconds: 60 },
};

/**
 * Get client IP address from request.
 * Relies on Express `trust proxy` (configured on the app) so spoofed
 * X-Forwarded-For headers from untrusted clients are ignored.
 * @param {Object} req - Express request
 * @returns {string} - Client IP
 */
const getClientIP = (req) => {
  return req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
};

/**
 * Create rate limiter middleware
 * @param {string} limitType - Type of rate limit to apply
 * @returns {Function} - Express middleware
 */
const createRateLimiter = (limitType = 'default') => {
  const config = RATE_LIMITS[limitType] || RATE_LIMITS.default;

  return async (req, res, next) => {
    const clientIP = getClientIP(req);
    const keys = [`rate_limit:${limitType}:${clientIP}`];

    if (limitType === 'adminLogin' && typeof req.body?.email === 'string') {
      const normalizedEmail = req.body.email.trim().toLowerCase();
      if (normalizedEmail) {
        keys.push(`rate_limit:${limitType}:acct:${normalizedEmail}`);
      }
    }

    try {
      let maxCurrent = 0;
      let minRemaining = config.requests;
      let effectiveTtl = config.windowSeconds;

      for (const key of keys) {
        const current = await redisService.client.incr(key);

        if (current === 1) {
          await redisService.client.expire(key, config.windowSeconds);
        }

        let ttl = await redisService.client.ttl(key);
        if (ttl < 0) {
          ttl = config.windowSeconds;
        }

        if (current > config.requests && config.backoff) {
          const backoffSeconds = Math.min(
            config.windowSeconds * Math.pow(2, current - config.requests - 1),
            3600
          );
          await redisService.client.expire(key, backoffSeconds);
          ttl = backoffSeconds;
        }

        if (current > maxCurrent) {
          maxCurrent = current;
          effectiveTtl = ttl;
        }
        minRemaining = Math.min(minRemaining, Math.max(0, config.requests - current));
      }

      // Add rate limit headers
      res.set('X-RateLimit-Limit', config.requests.toString());
      res.set('X-RateLimit-Remaining', minRemaining.toString());
      res.set('X-RateLimit-Reset', Math.ceil(Date.now() / 1000 + effectiveTtl).toString());

      if (maxCurrent > config.requests) {
        logger.warn(`Rate limit exceeded for ${sanitizeIP(clientIP)} on ${limitType}`);
        res.set('Retry-After', effectiveTtl.toString());
        return res.status(429).json({
          success: false,
          error: 'Too many requests. Please try again later.',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: effectiveTtl,
        });
      }

      next();
    } catch (error) {
      logger.error('Rate limiter error:', error);
      if (config.failClosed) {
        return res.status(503).json({
          success: false,
          error: 'Service temporarily unavailable. Please try again later.',
          code: 'RATE_LIMIT_UNAVAILABLE',
        });
      }
      next();
    }
  };
};

// Pre-configured middleware exports
module.exports = {
  createRateLimiter,
  getClientIP,
  mailboxRegister: createRateLimiter('mailboxRegister'),
  mailboxRefresh: createRateLimiter('mailboxRefresh'),
  emailFetch: createRateLimiter('emailFetch'),
  licenseValidate: createRateLimiter('licenseValidate'),
  adminLogin: createRateLimiter('adminLogin'),
  orderLookup: createRateLimiter('orderLookup'),
  gradeReport: createRateLimiter('gradeReport'),
  mailGrade: createRateLimiter('mailGrade'),
  senderReport: createRateLimiter('senderReport'),
  senderCheck: createRateLimiter('senderCheck'),
  reportsRead: createRateLimiter('reportsRead'),
  dmarcReports: createRateLimiter('dmarcReports'),
  bounceReport: createRateLimiter('bounceReport'),
  bounceRead: createRateLimiter('bounceRead'),
  complaintReport: createRateLimiter('complaintReport'),
  complaintRead: createRateLimiter('complaintRead'),
  tlsReport: createRateLimiter('tlsReport'),
  tlsRead: createRateLimiter('tlsRead'),
  default: createRateLimiter('default'),
  RATE_LIMITS,
};
