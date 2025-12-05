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
const redisService = require('./redisService');

// Rate limit configurations per endpoint type
const RATE_LIMITS = {
  // Mailbox registration: 10 per minute per IP (prevent mass mailbox creation)
  mailboxRegister: { requests: 10, windowSeconds: 60 },
  // Mailbox refresh: 30 per minute per IP
  mailboxRefresh: { requests: 30, windowSeconds: 60 },
  // Email fetching: 60 per minute per IP
  emailFetch: { requests: 60, windowSeconds: 60 },
  // Default: 100 per minute per IP
  default: { requests: 100, windowSeconds: 60 },
};

/**
 * Get client IP address from request
 * Handles X-Forwarded-For header for proxied requests
 * @param {Object} req - Express request
 * @returns {string} - Client IP
 */
const getClientIP = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || 'unknown';
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
    const key = `rate_limit:${limitType}:${clientIP}`;

    try {
      const current = await redisService.client.incr(key);
      
      if (current === 1) {
        // Set expiration on first request
        await redisService.client.expire(key, config.windowSeconds);
      }

      // Add rate limit headers
      const ttl = await redisService.client.ttl(key);
      res.set('X-RateLimit-Limit', config.requests.toString());
      res.set('X-RateLimit-Remaining', Math.max(0, config.requests - current).toString());
      res.set('X-RateLimit-Reset', Math.ceil(Date.now() / 1000 + ttl).toString());

      if (current > config.requests) {
        logger.warn(`Rate limit exceeded for ${clientIP} on ${limitType}`);
        return res.status(429).json({
          success: false,
          error: 'Too many requests. Please try again later.',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: ttl,
        });
      }

      next();
    } catch (error) {
      // If Redis fails, allow the request (fail open)
      logger.error('Rate limiter error:', error);
      next();
    }
  };
};

// Pre-configured middleware exports
module.exports = {
  createRateLimiter,
  mailboxRegister: createRateLimiter('mailboxRegister'),
  mailboxRefresh: createRateLimiter('mailboxRefresh'),
  emailFetch: createRateLimiter('emailFetch'),
  default: createRateLimiter('default'),
  RATE_LIMITS,
};
