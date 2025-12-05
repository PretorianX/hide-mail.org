/**
 * Forwarding Controller for Forward & Forget Feature
 * 
 * API endpoints for privacy-focused email forwarding.
 * Handles OTP validation, forwarding status, and message forwarding.
 * 
 * Endpoints:
 * - POST /api/forwarding/request-otp - Request OTP for destination email
 * - POST /api/forwarding/verify-otp - Verify OTP and activate forwarding
 * - POST /api/forwarding/forward/:email/:messageId - Forward specific message
 * - GET /api/forwarding/status/:email - Get forwarding status
 */

const forwardingService = require('../services/forwardingService');
const logger = require('../utils/logger');

/**
 * Request OTP for destination email validation
 * Privacy note: OTP validation is per temporary mailbox
 */
const requestOTP = async (req, res, next) => {
  try {
    const { tempMailbox, destinationEmail } = req.body;

    // Validate required fields
    if (!tempMailbox) {
      return res.status(400).json({
        success: false,
        error: 'Temporary mailbox is required',
        code: 'MISSING_TEMP_MAILBOX',
      });
    }

    if (!destinationEmail) {
      return res.status(400).json({
        success: false,
        error: 'Destination email is required',
        code: 'MISSING_DESTINATION_EMAIL',
      });
    }

    // Request OTP
    const result = await forwardingService.requestOTP(tempMailbox, destinationEmail);

    res.status(200).json({
      success: true,
      message: result.message,
      expiresInMinutes: result.expiresInMinutes,
    });
  } catch (error) {
    logger.error('Forwarding Controller: requestOTP error', error);
    
    // Handle specific errors
    if (error.message.includes('not active')) {
      return res.status(404).json({
        success: false,
        error: 'Temporary mailbox not found or expired',
        code: 'MAILBOX_NOT_ACTIVE',
      });
    }

    if (error.message.includes('Too many')) {
      return res.status(429).json({
        success: false,
        error: error.message,
        code: 'OTP_RATE_LIMIT',
      });
    }

    if (error.message.includes('Invalid email')) {
      return res.status(400).json({
        success: false,
        error: error.message,
        code: 'INVALID_EMAIL_FORMAT',
      });
    }

    next(error);
  }
};

/**
 * Verify OTP and activate forwarding for the mailbox
 */
const verifyOTP = async (req, res, next) => {
  try {
    const { tempMailbox, destinationEmail, otp } = req.body;

    // Validate required fields
    if (!tempMailbox || !destinationEmail || !otp) {
      return res.status(400).json({
        success: false,
        error: 'Temporary mailbox, destination email, and OTP are required',
        code: 'MISSING_REQUIRED_FIELDS',
      });
    }

    // Verify OTP
    const result = await forwardingService.verifyOTP(tempMailbox, destinationEmail, otp);

    res.status(200).json({
      success: true,
      message: result.message,
      destinationEmail: result.destinationEmail,
    });
  } catch (error) {
    logger.error('Forwarding Controller: verifyOTP error', error);
    
    if (error.message.includes('Invalid') || error.message.includes('expired')) {
      return res.status(400).json({
        success: false,
        error: error.message,
        code: 'INVALID_OTP',
      });
    }

    next(error);
  }
};

/**
 * Forward a specific message to the validated destination
 * Rate limited per temporary mailbox
 */
const forwardMessage = async (req, res, next) => {
  try {
    const { email, messageId } = req.params;

    // Validate required fields
    if (!email || !messageId) {
      return res.status(400).json({
        success: false,
        error: 'Email and message ID are required',
        code: 'MISSING_REQUIRED_FIELDS',
      });
    }

    // Forward the message
    const result = await forwardingService.forwardEmail(email, messageId);

    res.status(200).json({
      success: true,
      message: result.message,
      messageId: result.messageId,
      destinationEmail: result.destinationEmail,
    });
  } catch (error) {
    logger.error('Forwarding Controller: forwardMessage error', error);
    
    // Handle rate limit exceeded
    if (error.code === 'RATE_LIMIT_EXCEEDED') {
      return res.status(429).json({
        success: false,
        error: 'Forwarding limit reached for this hour',
        code: 'RATE_LIMIT_EXCEEDED',
        rateLimit: error.status,
      });
    }

    // Handle no validated destination
    if (error.code === 'NO_VALIDATED_DESTINATION') {
      return res.status(403).json({
        success: false,
        error: error.message,
        code: 'NO_VALIDATED_DESTINATION',
      });
    }

    // Handle email not found
    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'Email message not found',
        code: 'MESSAGE_NOT_FOUND',
      });
    }

    // Handle SMTP/forwarding specific errors with detailed messages
    // These errors do NOT consume the rate limit (only success increments the counter)
    if (error.code && error.code.startsWith('SMTP_')) {
      return res.status(503).json({
        success: false,
        error: error.message,
        code: error.code,
        detail: error.originalError,
      });
    }

    // Handle recipient rejection
    if (error.code === 'RECIPIENT_REJECTED') {
      return res.status(400).json({
        success: false,
        error: error.message,
        code: error.code,
      });
    }

    next(error);
  }
};

/**
 * Get forwarding status for a temporary mailbox
 * Returns validated destination (if any), rate limit status, etc.
 */
const getForwardingStatus = async (req, res, next) => {
  try {
    const { email } = req.params;

    // Validate required field
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required',
        code: 'MISSING_EMAIL',
      });
    }

    // Get status
    const status = await forwardingService.getForwardingStatus(email);

    res.status(200).json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error('Forwarding Controller: getForwardingStatus error', error);
    next(error);
  }
};

/**
 * Clear forwarding configuration for a mailbox
 * Allows user to reset and configure a different destination
 */
const clearForwarding = async (req, res, next) => {
  try {
    const { email } = req.params;

    // Validate required field
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required',
        code: 'MISSING_EMAIL',
      });
    }

    // Clear forwarding
    await forwardingService.clearForwarding(email);

    res.status(200).json({
      success: true,
      message: 'Forwarding configuration cleared',
    });
  } catch (error) {
    logger.error('Forwarding Controller: clearForwarding error', error);
    next(error);
  }
};

module.exports = {
  requestOTP,
  verifyOTP,
  forwardMessage,
  getForwardingStatus,
  clearForwarding,
};

