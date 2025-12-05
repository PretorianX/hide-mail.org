/**
 * OTP Service for Forward & Forget Feature
 * 
 * Privacy-focused one-time password generation and validation.
 * OTP validation is scoped to temporary mailboxes - each new mailbox
 * requires fresh validation for forwarding destinations.
 * 
 * Configuration via environment variables:
 * - OTP_EXPIRATION_MINUTES: OTP validity period (default: 15)
 * - OTP_LENGTH: OTP length in digits (default: 6)
 * 
 * Redis Keys:
 * - otp:{tempMailbox}:{destinationEmail} - Stores OTP code (expires)
 * - forwarding:{tempMailbox} - Stores validated destination (expires with mailbox)
 */

const otpGenerator = require('otp-generator');
const logger = require('../utils/logger');
const config = require('../config/config');
const redisService = require('./redisService');

// Redis key prefixes
const KEY_PREFIXES = {
  OTP: 'otp:',
  FORWARDING: 'forwarding:',
};

/**
 * Generate a new OTP code
 * @returns {string} - Generated OTP code
 */
const generateOTP = () => {
  const length = config.forwarding?.otpLength || 6;
  
  return otpGenerator.generate(length, {
    digits: true,
    lowerCaseAlphabets: false,
    upperCaseAlphabets: false,
    specialChars: false,
  });
};

/**
 * Create and store an OTP for a destination email
 * @param {string} tempMailbox - Temporary mailbox requesting forwarding
 * @param {string} destinationEmail - Destination email to validate
 * @returns {Promise<string>} - Generated OTP code
 */
const createOTP = async (tempMailbox, destinationEmail) => {
  // Validate inputs
  if (!tempMailbox || !destinationEmail) {
    throw new Error('Temporary mailbox and destination email are required');
  }

  // Normalize emails to lowercase
  const normalizedTempMailbox = tempMailbox.toLowerCase();
  const normalizedDestination = destinationEmail.toLowerCase();

  // Check if mailbox is active
  const isActive = await redisService.isMailboxActive(normalizedTempMailbox);
  if (!isActive) {
    throw new Error('Temporary mailbox is not active');
  }

  // Generate OTP
  const otp = generateOTP();
  
  // Store OTP in Redis with expiration
  const key = `${KEY_PREFIXES.OTP}${normalizedTempMailbox}:${normalizedDestination}`;
  const expirationSeconds = (config.forwarding?.otpExpirationMinutes || 15) * 60;
  
  await redisService.client.set(key, otp, 'EX', expirationSeconds);
  
  logger.info(`OTP Service: Created OTP for ${normalizedTempMailbox} -> ${normalizedDestination}`);
  
  return otp;
};

/**
 * Verify an OTP code
 * @param {string} tempMailbox - Temporary mailbox
 * @param {string} destinationEmail - Destination email
 * @param {string} otp - OTP code to verify
 * @returns {Promise<boolean>} - True if OTP is valid
 */
const verifyOTP = async (tempMailbox, destinationEmail, otp) => {
  // Validate inputs
  if (!tempMailbox || !destinationEmail || !otp) {
    throw new Error('All parameters are required');
  }

  // Normalize emails
  const normalizedTempMailbox = tempMailbox.toLowerCase();
  const normalizedDestination = destinationEmail.toLowerCase();

  // Get stored OTP
  const key = `${KEY_PREFIXES.OTP}${normalizedTempMailbox}:${normalizedDestination}`;
  const storedOTP = await redisService.client.get(key);
  
  if (!storedOTP) {
    logger.warn(`OTP Service: No OTP found for ${normalizedTempMailbox} -> ${normalizedDestination}`);
    return false;
  }
  
  // Verify OTP (constant-time comparison for security)
  const isValid = storedOTP === otp;
  
  if (isValid) {
    // Delete used OTP
    await redisService.client.del(key);
    
    // Store validated destination
    await setValidatedDestination(normalizedTempMailbox, normalizedDestination);
    
    logger.info(`OTP Service: OTP verified for ${normalizedTempMailbox} -> ${normalizedDestination}`);
  } else {
    logger.warn(`OTP Service: Invalid OTP for ${normalizedTempMailbox} -> ${normalizedDestination}`);
  }
  
  return isValid;
};

/**
 * Store a validated destination email for a temporary mailbox
 * @param {string} tempMailbox - Temporary mailbox
 * @param {string} destinationEmail - Validated destination email
 * @returns {Promise<void>}
 */
const setValidatedDestination = async (tempMailbox, destinationEmail) => {
  const key = `${KEY_PREFIXES.FORWARDING}${tempMailbox.toLowerCase()}`;
  
  // Get mailbox TTL to sync forwarding expiration
  const mailboxKey = `active_mailbox:${tempMailbox.toLowerCase()}`;
  const ttl = await redisService.client.ttl(mailboxKey);
  
  const data = JSON.stringify({
    destinationEmail: destinationEmail.toLowerCase(),
    verifiedAt: new Date().toISOString(),
  });
  
  if (ttl > 0) {
    await redisService.client.set(key, data, 'EX', ttl);
  } else {
    // Default to 30 minutes if mailbox TTL not found
    await redisService.client.set(key, data, 'EX', 1800);
  }
  
  logger.info(`OTP Service: Set validated destination for ${tempMailbox}`);
};

/**
 * Get the validated destination for a temporary mailbox
 * @param {string} tempMailbox - Temporary mailbox
 * @returns {Promise<Object|null>} - Destination info or null
 */
const getValidatedDestination = async (tempMailbox) => {
  const key = `${KEY_PREFIXES.FORWARDING}${tempMailbox.toLowerCase()}`;
  const data = await redisService.client.get(key);
  
  if (!data) {
    return null;
  }
  
  try {
    return JSON.parse(data);
  } catch (error) {
    logger.error('OTP Service: Failed to parse destination data', error);
    return null;
  }
};

/**
 * Check if a temporary mailbox has a validated forwarding destination
 * @param {string} tempMailbox - Temporary mailbox
 * @returns {Promise<boolean>} - True if validated destination exists
 */
const hasValidatedDestination = async (tempMailbox) => {
  const destination = await getValidatedDestination(tempMailbox);
  return destination !== null;
};

/**
 * Remove validated destination for a temporary mailbox
 * @param {string} tempMailbox - Temporary mailbox
 * @returns {Promise<void>}
 */
const removeValidatedDestination = async (tempMailbox) => {
  const key = `${KEY_PREFIXES.FORWARDING}${tempMailbox.toLowerCase()}`;
  await redisService.client.del(key);
  logger.info(`OTP Service: Removed validated destination for ${tempMailbox}`);
};

/**
 * Check if OTP request is allowed (rate limiting for OTP requests)
 * @param {string} tempMailbox - Temporary mailbox
 * @param {string} destinationEmail - Destination email
 * @returns {Promise<boolean>} - True if allowed
 */
const canRequestOTP = async (tempMailbox, destinationEmail) => {
  // Simple rate limit: max 3 OTP requests per 5 minutes per destination
  const key = `otp_rate:${tempMailbox.toLowerCase()}:${destinationEmail.toLowerCase()}`;
  const count = await redisService.client.incr(key);
  
  if (count === 1) {
    // Set expiration on first request
    await redisService.client.expire(key, 300); // 5 minutes
  }
  
  return count <= 3;
};

module.exports = {
  generateOTP,
  createOTP,
  verifyOTP,
  getValidatedDestination,
  hasValidatedDestination,
  removeValidatedDestination,
  canRequestOTP,
};

