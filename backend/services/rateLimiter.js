/**
 * Rate Limiter Service for Forward & Forget Feature
 * 
 * Server-side rate limiting for email forwarding.
 * Limits forwarding to prevent abuse while allowing legitimate use.
 * 
 * Rate limiting is per temporary mailbox (not per destination).
 * Uses hourly sliding window with Redis counters.
 * 
 * Configuration via environment variables:
 * - FORWARDING_RATE_LIMIT: Max forwards per hour (default: 10)
 * 
 * Redis Keys:
 * - forwarding:rate:{tempMailbox}:{hourTimestamp} - Forwarding counter
 */

const logger = require('../utils/logger');
const config = require('../config/config');
const { sanitizeEmail } = require('../utils/sanitize');
const redisService = require('./redisService');

// Redis key prefix
const RATE_KEY_PREFIX = 'forwarding:rate:';

/**
 * Get the current hour timestamp for rate limiting window
 * @returns {string} - Hour timestamp (e.g., "2024120512")
 */
const getCurrentHourTimestamp = () => {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}`;
};

/**
 * Get the rate limit key for a mailbox
 * @param {string} tempMailbox - Temporary mailbox
 * @returns {string} - Redis key
 */
const getRateLimitKey = (tempMailbox) => {
  const hourTimestamp = getCurrentHourTimestamp();
  return `${RATE_KEY_PREFIX}${tempMailbox.toLowerCase()}:${hourTimestamp}`;
};

/**
 * Check if forwarding is allowed (rate limit not exceeded)
 * @param {string} tempMailbox - Temporary mailbox to check
 * @returns {Promise<Object>} - Rate limit status
 */
const checkRateLimit = async (tempMailbox) => {
  const key = getRateLimitKey(tempMailbox);
  const limit = config.forwarding?.rateLimit || 10;
  
  // Get current count
  const countStr = await redisService.client.get(key);
  const currentCount = parseInt(countStr, 10) || 0;
  
  const remaining = Math.max(0, limit - currentCount);
  const allowed = currentCount < limit;
  
  // Calculate time until reset (start of next hour)
  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
  const resetInSeconds = Math.ceil((nextHour - now) / 1000);
  
  return {
    allowed,
    limit,
    current: currentCount,
    remaining,
    resetInSeconds,
    resetAt: nextHour.toISOString(),
  };
};

/**
 * Increment the forwarding counter for a mailbox
 * Should be called after successful forwarding
 * @param {string} tempMailbox - Temporary mailbox
 * @returns {Promise<number>} - New count
 */
const incrementForwardCount = async (tempMailbox) => {
  const key = getRateLimitKey(tempMailbox);
  
  // Increment counter
  const newCount = await redisService.client.incr(key);
  
  // Set expiration if this is the first increment (expire at end of hour + 1 minute buffer)
  if (newCount === 1) {
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setHours(nextHour.getHours() + 1, 1, 0, 0); // 1 minute buffer
    const ttl = Math.ceil((nextHour - now) / 1000);
    await redisService.client.expire(key, ttl);
  }
  
  logger.info(`Rate Limiter: Forward count for ${sanitizeEmail(tempMailbox)} is now ${newCount}`);
  
  return newCount;
};

/**
 * Get current forwarding statistics for a mailbox
 * @param {string} tempMailbox - Temporary mailbox
 * @returns {Promise<Object>} - Forwarding statistics
 */
const getForwardingStats = async (tempMailbox) => {
  const rateLimit = await checkRateLimit(tempMailbox);
  
  return {
    forwardsUsed: rateLimit.current,
    forwardsRemaining: rateLimit.remaining,
    limit: rateLimit.limit,
    resetAt: rateLimit.resetAt,
    resetInSeconds: rateLimit.resetInSeconds,
    canForward: rateLimit.allowed,
  };
};

/**
 * Check rate limit and throw if exceeded
 * @param {string} tempMailbox - Temporary mailbox
 * @throws {Error} - If rate limit exceeded
 * @returns {Promise<Object>} - Rate limit status
 */
const enforceRateLimit = async (tempMailbox) => {
  const status = await checkRateLimit(tempMailbox);
  
  if (!status.allowed) {
    const error = new Error('Rate limit exceeded');
    error.code = 'RATE_LIMIT_EXCEEDED';
    error.status = status;
    throw error;
  }
  
  return status;
};

/**
 * Reset rate limit for a mailbox (admin use)
 * @param {string} tempMailbox - Temporary mailbox
 * @returns {Promise<void>}
 */
const resetRateLimit = async (tempMailbox) => {
  const key = getRateLimitKey(tempMailbox);
  await redisService.client.del(key);
  logger.info(`Rate Limiter: Reset rate limit for ${tempMailbox}`);
};

module.exports = {
  checkRateLimit,
  incrementForwardCount,
  getForwardingStats,
  enforceRateLimit,
  resetRateLimit,
  getCurrentHourTimestamp,
};

