/**
 * Attachment downloads.
 *
 * One handler serves both the browser inbox and the QA API, because the two routes carry the
 * same parameters and differ only in the authentication their routers apply:
 *
 *   GET /api/emails/:email/:id/attachments/:index
 *   GET /api/qa/mailboxes/:email/messages/:id/attachments/:index
 */

const redisService = require('../services/redisService');
const attachmentService = require('../services/attachmentService');
const { assertMailboxOwner, MailboxOwnershipError } = require('../services/mailboxAuth');
const logger = require('../utils/logger');
const { sanitizeEmail, sanitizeMessageId } = require('../utils/sanitize');

const downloadAttachment = async (req, res, next) => {
  try {
    const { email, id, index } = req.params;

    if (!email || !email.includes('@')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email address',
        code: 'INVALID_ADDRESS',
      });
    }

    if (req.apiLicense) {
      await assertMailboxOwner(email, req.apiLicense);
    }

    const message = await redisService.getEmailById(email, id);
    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found',
        code: 'MESSAGE_NOT_FOUND',
      });
    }

    const attachment = attachmentService.resolveAttachment(message, index);
    if (!attachment) {
      return res.status(404).json({
        success: false,
        error: 'Attachment not found',
        code: 'ATTACHMENT_NOT_FOUND',
      });
    }

    logger.info(
      `Attachment downloaded: ${sanitizeEmail(email)} message ${sanitizeMessageId(id)} part ${sanitizeMessageId(index)}`
    );

    res.set({
      'Content-Type': attachment.contentType,
      'Content-Length': String(attachment.content.length),
      'Content-Disposition': attachmentService.contentDispositionHeader(attachment.filename),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });

    return res.status(200).send(attachment.content);
  } catch (error) {
    if (error instanceof MailboxOwnershipError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.code,
      });
    }
    logger.error('Error in downloadAttachment controller:', error);
    return next(error);
  }
};

module.exports = {
  downloadAttachment,
};
