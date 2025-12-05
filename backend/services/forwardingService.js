/**
 * Forwarding Service for Forward & Forget Feature
 * 
 * Main orchestration service for the privacy-focused email forwarding feature.
 * Coordinates OTP validation, rate limiting, SRS rewriting, and SMTP delivery.
 * 
 * Privacy Design:
 * - No persistent user accounts
 * - OTP validation scoped to temporary mailbox
 * - Forwarding state expires with mailbox
 * - All data automatically cleaned up
 * 
 * Flow:
 * 1. User requests OTP for destination email
 * 2. User verifies OTP to validate destination
 * 3. User can forward individual emails (rate limited)
 */

const logger = require('../utils/logger');
const config = require('../config/config');
const redisService = require('./redisService');
const otpService = require('./otpService');
const rateLimiter = require('./rateLimiter');
const srsService = require('./srsService');
const smtpService = require('./smtpService');

/**
 * Request OTP for a destination email
 * @param {string} tempMailbox - Temporary mailbox
 * @param {string} destinationEmail - Destination email to validate
 * @returns {Promise<Object>} - Request result
 */
const requestOTP = async (tempMailbox, destinationEmail) => {
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(destinationEmail)) {
    throw new Error('Invalid email address format');
  }

  // Check if mailbox is active
  const isActive = await redisService.isMailboxActive(tempMailbox);
  if (!isActive) {
    throw new Error('Temporary mailbox is not active');
  }

  // Check OTP rate limit
  const canRequest = await otpService.canRequestOTP(tempMailbox, destinationEmail);
  if (!canRequest) {
    throw new Error('Too many OTP requests. Please wait a few minutes.');
  }

  // Generate and store OTP
  const otp = await otpService.createOTP(tempMailbox, destinationEmail);

  // Send OTP email
  try {
    await smtpService.sendOTPEmail(destinationEmail, otp, tempMailbox);
    logger.info(`Forwarding Service: OTP sent to ${destinationEmail} for ${tempMailbox}`);
  } catch (error) {
    logger.error('Forwarding Service: Failed to send OTP email', error);
    throw new Error('Failed to send verification email. Please try again.');
  }

  return {
    success: true,
    message: 'Verification code sent to your email',
    expiresInMinutes: config.forwarding?.otpExpirationMinutes || 15,
  };
};

/**
 * Verify OTP and activate forwarding
 * @param {string} tempMailbox - Temporary mailbox
 * @param {string} destinationEmail - Destination email
 * @param {string} otp - OTP code to verify
 * @returns {Promise<Object>} - Verification result
 */
const verifyOTP = async (tempMailbox, destinationEmail, otp) => {
  // Validate inputs
  if (!otp || otp.length !== (config.forwarding?.otpLength || 6)) {
    throw new Error('Invalid verification code format');
  }

  // Verify OTP
  const isValid = await otpService.verifyOTP(tempMailbox, destinationEmail, otp);
  
  if (!isValid) {
    throw new Error('Invalid or expired verification code');
  }

  logger.info(`Forwarding Service: Destination verified for ${tempMailbox} -> ${destinationEmail}`);

  return {
    success: true,
    message: 'Email address verified. You can now forward emails.',
    destinationEmail: destinationEmail.toLowerCase(),
  };
};

/**
 * Forward a specific email to the validated destination
 * @param {string} tempMailbox - Temporary mailbox
 * @param {string} messageId - Message ID to forward
 * @returns {Promise<Object>} - Forward result
 */
const forwardEmail = async (tempMailbox, messageId) => {
  // Check if destination is validated
  const destination = await otpService.getValidatedDestination(tempMailbox);
  if (!destination) {
    const error = new Error('No validated destination email. Please verify your email first.');
    error.code = 'NO_VALIDATED_DESTINATION';
    throw error;
  }

  // Check rate limit
  await rateLimiter.enforceRateLimit(tempMailbox);

  // Get the email from Redis
  const email = await redisService.getEmailById(tempMailbox, messageId);
  if (!email) {
    throw new Error('Email not found');
  }

  // Apply SRS rewriting
  let srsFrom;
  if (srsService.isConfigured()) {
    const rewritten = srsService.rewriteForForwarding(email);
    srsFrom = rewritten.srsFrom;
  } else {
    // Fallback: use our domain if SRS not configured
    srsFrom = `forwarding@${config.validDomains[0] || 'mailduck.io'}`;
    logger.warn('Forwarding Service: SRS not configured, using fallback from address');
  }

  // Forward the email
  try {
    await smtpService.forwardEmail({
      to: destination.destinationEmail,
      originalEmail: email,
      srsFrom,
      tempMailbox,
    });

    // Increment rate limit counter after successful forward
    await rateLimiter.incrementForwardCount(tempMailbox);

    logger.info(`Forwarding Service: Email ${messageId} forwarded to ${destination.destinationEmail}`);

    return {
      success: true,
      message: 'Email forwarded successfully',
      messageId,
      destinationEmail: destination.destinationEmail,
    };
  } catch (error) {
    logger.error('Forwarding Service: Failed to forward email', error);
    throw new Error('Failed to forward email. Please try again.');
  }
};

/**
 * Get forwarding status for a temporary mailbox
 * @param {string} tempMailbox - Temporary mailbox
 * @returns {Promise<Object>} - Forwarding status
 */
const getForwardingStatus = async (tempMailbox) => {
  // Check if mailbox is active
  const isActive = await redisService.isMailboxActive(tempMailbox);
  if (!isActive) {
    return {
      active: false,
      hasValidatedDestination: false,
      destinationEmail: null,
      rateLimit: null,
    };
  }

  // Get validated destination
  const destination = await otpService.getValidatedDestination(tempMailbox);
  
  // Get rate limit status
  const rateLimit = await rateLimiter.getForwardingStats(tempMailbox);

  return {
    active: true,
    hasValidatedDestination: destination !== null,
    destinationEmail: destination?.destinationEmail || null,
    verifiedAt: destination?.verifiedAt || null,
    rateLimit,
    srsConfigured: srsService.isConfigured(),
  };
};

/**
 * Clear forwarding configuration for a mailbox
 * @param {string} tempMailbox - Temporary mailbox
 * @returns {Promise<void>}
 */
const clearForwarding = async (tempMailbox) => {
  await otpService.removeValidatedDestination(tempMailbox);
  logger.info(`Forwarding Service: Cleared forwarding for ${tempMailbox}`);
};

/**
 * Initialize forwarding service
 * Call at application startup
 */
const initialize = () => {
  // Initialize SMTP service
  const smtpInitialized = smtpService.initialize();
  
  if (!smtpInitialized) {
    logger.warn('Forwarding Service: SMTP not configured, forwarding disabled');
  }

  // Check SRS configuration
  if (!srsService.isConfigured()) {
    logger.warn('Forwarding Service: SRS not configured, emails may fail SPF checks');
  }

  logger.info('Forwarding Service: Initialized');
};

module.exports = {
  requestOTP,
  verifyOTP,
  forwardEmail,
  getForwardingStatus,
  clearForwarding,
  initialize,
};

