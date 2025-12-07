/**
 * SMTP Service for Forward & Forget Feature
 * 
 * Privacy-focused email sending service with DKIM signing support.
 * Used to send OTP verification codes and forward emails to validated destinations.
 * 
 * Configuration via environment variables:
 * - SMTP_HOST: SMTP server hostname
 * - SMTP_PORT: SMTP port (default: 587)
 * - SMTP_USER: SMTP username
 * - SMTP_PASS: SMTP password
 * - SMTP_SECURE: Use TLS (true/false)
 * - SMTP_FROM_EMAIL: Default from address
 * - SMTP_FROM_NAME: Default from name
 * - DKIM_DOMAIN: Domain for DKIM signing
 * - DKIM_SELECTOR: DKIM selector (default: 'default')
 * - DKIM_PRIVATE_KEY: DKIM private key content (PEM format)
 */

const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const config = require('../config/config');
const { sanitizeEmail, sanitizeMessageId } = require('../utils/sanitize');

// DKIM configuration (optional)
const getDkimConfig = () => {
  if (!config.dkim?.domain || !config.dkim?.privateKey) {
    return null;
  }

  return {
    domainName: config.dkim.domain,
    keySelector: config.dkim.selector || 'default',
    privateKey: config.dkim.privateKey,
  };
};

// Create transporter with SMTP configuration
const createTransporter = () => {
  const transportConfig = {
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
  };

  // Only add auth if credentials are provided
  if (config.smtp.user && config.smtp.pass) {
    transportConfig.auth = {
      user: config.smtp.user,
      pass: config.smtp.pass,
    };
  }

  // For internal Docker network communication (e.g., to Postfix),
  // we need to handle self-signed certificates
  // In production, Postfix uses self-signed certs for internal STARTTLS
  if (!config.smtp.secure) {
    transportConfig.tls = {
      // Accept self-signed certificates (safe for internal Docker network)
      rejectUnauthorized: false,
    };
  }

  // Add DKIM configuration if available
  const dkimConfig = getDkimConfig();
  if (dkimConfig) {
    transportConfig.dkim = dkimConfig;
    logger.info('SMTP Service: DKIM signing enabled');
  }

  return nodemailer.createTransport(transportConfig);
};

let transporter = null;

/**
 * Initialize the SMTP transporter
 * Call this once at application startup
 */
const initialize = () => {
  if (!config.smtp.host) {
    logger.warn('SMTP Service: SMTP_HOST not configured, email sending disabled');
    return false;
  }

  try {
    transporter = createTransporter();
    logger.info('SMTP Service: Initialized successfully');
    return true;
  } catch (error) {
    logger.error('SMTP Service: Failed to initialize', error);
    return false;
  }
};

/**
 * Send an email
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} options.text - Plain text content
 * @param {string} [options.from] - From address (optional, uses default)
 * @param {Object} [options.headers] - Additional headers
 * @returns {Promise<Object>} - Send result
 */
const sendEmail = async ({ to, subject, html, text, from, headers = {} }) => {
  if (!transporter) {
    throw new Error('SMTP Service not initialized');
  }

  const mailOptions = {
    from: from || `"${config.smtp.fromName}" <${config.smtp.fromEmail}>`,
    to,
    subject,
    html,
    text,
    headers,
  };

  try {
    const result = await transporter.sendMail(mailOptions);
    logger.info(`SMTP Service: Email sent to ${sanitizeEmail(to)}, messageId: ${sanitizeMessageId(result.messageId)}`);
    return result;
  } catch (error) {
    logger.error(`SMTP Service: Failed to send email to ${sanitizeEmail(to)}`, error);
    throw error;
  }
};

/**
 * Send OTP verification email
 * @param {string} destinationEmail - Recipient email address
 * @param {string} otp - One-time password
 * @param {string} tempMailbox - Temporary mailbox being validated
 * @returns {Promise<Object>} - Send result
 */
const sendOTPEmail = async (destinationEmail, otp, tempMailbox) => {
  const subject = 'Your Forward & Forget Verification Code';
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
      <div style="background-color: #ffffff; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <h1 style="color: #333; margin-bottom: 24px; font-size: 24px;">Forward & Forget Verification</h1>
        
        <p style="color: #666; line-height: 1.6; margin-bottom: 24px;">
          You requested to enable email forwarding from your temporary mailbox. 
          Use the verification code below to confirm this email address as your forwarding destination.
        </p>
        
        <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333;">${otp}</span>
        </div>
        
        <p style="color: #888; font-size: 14px; line-height: 1.6; margin-bottom: 16px;">
          <strong>Privacy note:</strong> This code expires in 15 minutes. 
          Once verified, you can forward emails from <code style="background-color: #f0f0f0; padding: 2px 6px; border-radius: 4px;">${tempMailbox}</code> 
          to this email address.
        </p>
        
        <p style="color: #888; font-size: 12px; line-height: 1.6;">
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    </body>
    </html>
  `;

  const text = `
Forward & Forget Verification

You requested to enable email forwarding from your temporary mailbox.
Use the verification code below to confirm this email address as your forwarding destination.

Your verification code: ${otp}

This code expires in 15 minutes.
Once verified, you can forward emails from ${tempMailbox} to this email address.

If you didn't request this, you can safely ignore this email.
  `;

  return sendEmail({
    to: destinationEmail,
    subject,
    html,
    text,
  });
};

/**
 * Convert stored attachment (with base64 content) to nodemailer attachment format
 * @param {Object} att - Stored attachment object
 * @returns {Object} - Nodemailer-compatible attachment
 */
const convertAttachment = (att) => {
  const attachment = {
    filename: att.filename || 'attachment',
    contentType: att.contentType || 'application/octet-stream',
  };

  // Convert base64 content back to Buffer
  if (att.content && att.encoding === 'base64') {
    attachment.content = Buffer.from(att.content, 'base64');
  } else if (att.content) {
    // Handle legacy format where content might be a Buffer JSON representation
    if (typeof att.content === 'object' && att.content.type === 'Buffer' && Array.isArray(att.content.data)) {
      attachment.content = Buffer.from(att.content.data);
    } else {
      attachment.content = att.content;
    }
  }

  // Set Content-ID for inline images (preserves cid: references in HTML)
  if (att.cid) {
    attachment.cid = att.cid;
    // Inline images should be marked as inline, not attachment
    attachment.contentDisposition = 'inline';
  } else {
    attachment.contentDisposition = att.contentDisposition || 'attachment';
  }

  return attachment;
};

/**
 * Forward an email to a destination
 * @param {Object} options - Forward options
 * @param {string} options.to - Destination email address
 * @param {Object} options.originalEmail - Original email object
 * @param {string} options.srsFrom - SRS-rewritten from address
 * @param {string} options.tempMailbox - Source temporary mailbox
 * @returns {Promise<Object>} - Send result
 */
const forwardEmail = async ({ to, originalEmail, srsFrom, tempMailbox }) => {
  if (!transporter) {
    throw new Error('SMTP Service not initialized');
  }

  const subject = originalEmail.subject || '(No Subject)';
  
  // Prepare forwarded email content with privacy header
  const forwardedHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
    </head>
    <body>
      <div style="background-color: #f0f7ff; border-left: 4px solid #3b82f6; padding: 12px 16px; margin-bottom: 20px; font-family: sans-serif;">
        <p style="margin: 0; color: #1e40af; font-size: 14px;">
          <strong>Forward & Forget</strong> — Saved from ${tempMailbox}
        </p>
        <p style="margin: 4px 0 0 0; color: #6b7280; font-size: 12px;">
          Original sender: ${originalEmail.from}
        </p>
      </div>
      ${originalEmail.html || `<pre style="white-space: pre-wrap;">${originalEmail.text || ''}</pre>`}
    </body>
    </html>
  `;

  const forwardedText = `
--- Forward & Forget ---
Saved from: ${tempMailbox}
Original sender: ${originalEmail.from}
---

${originalEmail.text || ''}
  `;

  // Prepare mail options
  const mailOptions = {
    from: srsFrom,
    to,
    subject: `[Forwarded] ${subject}`,
    html: forwardedHtml,
    text: forwardedText,
    headers: {
      'X-Forwarded-From': tempMailbox,
      'X-Original-From': originalEmail.from,
      'X-Forward-And-Forget': 'true',
    },
  };

  // Process and include attachments (including inline images)
  if (originalEmail.attachments && originalEmail.attachments.length > 0) {
    mailOptions.attachments = originalEmail.attachments
      .filter(att => att.content) // Only include attachments with content
      .map(convertAttachment);
    
    logger.info(`SMTP Service: Forwarding email with ${mailOptions.attachments.length} attachment(s)`);
  }

  try {
    const result = await transporter.sendMail(mailOptions);
    logger.info(`SMTP Service: Email forwarded to ${to}, messageId: ${result.messageId}`);
    return result;
  } catch (error) {
    logger.error(`SMTP Service: Failed to forward email to ${to}`, error);
    throw error;
  }
};

/**
 * Verify SMTP connection
 * @returns {Promise<boolean>} - True if connection is valid
 */
const verifyConnection = async () => {
  if (!transporter) {
    return false;
  }

  try {
    await transporter.verify();
    logger.info('SMTP Service: Connection verified');
    return true;
  } catch (error) {
    logger.error('SMTP Service: Connection verification failed', error);
    return false;
  }
};

module.exports = {
  initialize,
  sendEmail,
  sendOTPEmail,
  forwardEmail,
  verifyConnection,
};

