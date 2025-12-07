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
const { sanitizeEmail, sanitizeMessageId } = require('../utils/sanitize');
const redisService = require('./redisService');
const otpService = require('./otpService');
const rateLimiter = require('./rateLimiter');
const srsService = require('./srsService');
const smtpService = require('./smtpService');

/**
 * Map SMTP errors to user-friendly error codes
 * @param {Error} error - Original error from SMTP service
 * @returns {string} - Error code for frontend handling
 */
const getSmtpErrorCode = (error) => {
  const message = error.message?.toLowerCase() || '';
  const code = error.code?.toLowerCase() || '';
  const responseCode = error.responseCode;

  // SMTP not initialized
  if (message.includes('not initialized')) {
    return 'SMTP_NOT_CONFIGURED';
  }

  // Connection errors
  if (code === 'econnrefused' || code === 'enotfound' || code === 'etimedout') {
    return 'SMTP_CONNECTION_FAILED';
  }

  // Authentication errors
  if (responseCode === 535 || message.includes('authentication') || message.includes('auth')) {
    return 'SMTP_AUTH_FAILED';
  }

  // Recipient rejected
  if (responseCode === 550 || responseCode === 551 || responseCode === 552 || responseCode === 553) {
    return 'RECIPIENT_REJECTED';
  }

  // Temporary failures (should retry)
  if (responseCode >= 400 && responseCode < 500) {
    return 'SMTP_TEMPORARY_FAILURE';
  }

  // Generic SMTP error
  return 'SMTP_SEND_FAILED';
};

/**
 * Map SMTP errors to user-friendly messages
 * @param {Error} error - Original error from SMTP service
 * @returns {string} - User-friendly error message
 */
const getSmtpErrorMessage = (error) => {
  const code = getSmtpErrorCode(error);

  switch (code) {
    case 'SMTP_NOT_CONFIGURED':
      return 'Email forwarding service is temporarily unavailable. Please try again later.';
    case 'SMTP_CONNECTION_FAILED':
      return 'Unable to connect to email server. Please try again in a few moments.';
    case 'SMTP_AUTH_FAILED':
      return 'Email server authentication error. Please contact support.';
    case 'RECIPIENT_REJECTED':
      return 'The destination email address was rejected. Please verify the email address is correct.';
    case 'SMTP_TEMPORARY_FAILURE':
      return 'Email server is temporarily busy. Please try again in a few moments.';
    default:
      return 'Failed to forward email. Please try again.';
  }
};

/**
 * Request OTP for a destination email
 * @param {string} tempMailbox - Temporary mailbox
 * @param {string} destinationEmail - Destination email to validate
 * @returns {Promise<Object>} - Request result
 */
const requestOTP = async (tempMailbox, destinationEmail) => {
  // SECURITY: Validate input length before regex to prevent ReDoS attacks
  // RFC 5321 specifies max email length of 254 characters
  const MAX_EMAIL_LENGTH = 254;
  if (!destinationEmail || typeof destinationEmail !== 'string' || destinationEmail.length > MAX_EMAIL_LENGTH) {
    throw new Error('Invalid email address format');
  }

  // Validate email format (safe after length check)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(destinationEmail)) {
    throw new Error('Invalid email address format');
  }

  // SECURITY: Prevent forwarding to the same service domains (anti-spam relay)
  const destinationDomain = destinationEmail.split('@')[1].toLowerCase();
  const serviceDomains = config.validDomains.map(d => d.toLowerCase());
  if (serviceDomains.includes(destinationDomain)) {
    logger.warn(`Forwarding Service: Blocked forwarding to service domain: ${destinationDomain}`);
    throw new Error('Cannot forward to temporary email addresses. Please use a permanent email address.');
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
    logger.info(`Forwarding Service: OTP sent to ${sanitizeEmail(destinationEmail)} for ${sanitizeEmail(tempMailbox)}`);
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

  logger.info(`Forwarding Service: Destination verified for ${sanitizeEmail(tempMailbox)} -> ${sanitizeEmail(destinationEmail)}`);

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
    // Fallback: use SMTP_FROM_EMAIL if SRS not configured
    srsFrom = config.smtp.fromEmail;
    logger.warn('Forwarding Service: SRS not configured, using SMTP_FROM_EMAIL');
  }

  // Forward the email
  try {
    await smtpService.forwardEmail({
      to: destination.destinationEmail,
      originalEmail: email,
      srsFrom,
      tempMailbox,
    });

    // Increment rate limit counter ONLY after successful forward
    await rateLimiter.incrementForwardCount(tempMailbox);

    logger.info(`Forwarding Service: Email ${sanitizeMessageId(messageId)} forwarded to ${sanitizeEmail(destination.destinationEmail)}`);

    return {
      success: true,
      message: 'Email forwarded successfully',
      messageId,
      destinationEmail: destination.destinationEmail,
    };
  } catch (error) {
    logger.error('Forwarding Service: Failed to forward email', error);
    
    // Create error with specific details for better user feedback
    // Rate limit is NOT incremented on failure (only after success above)
    const forwardError = new Error(getSmtpErrorMessage(error));
    forwardError.code = getSmtpErrorCode(error);
    forwardError.originalError = error.message;
    throw forwardError;
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
  logger.info(`Forwarding Service: Cleared forwarding for ${sanitizeEmail(tempMailbox)}`);
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

