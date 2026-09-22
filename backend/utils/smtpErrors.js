/**
 * Translate a nodemailer/SMTP failure into a stable code the frontend can branch on.
 *
 * Shared by every outbound path (forwarding and replies) so one transport failure does not get
 * two different names depending on which feature hit it. The user-facing wording stays with the
 * caller, because "could not forward" and "could not send your reply" are different sentences.
 */

const classifySmtpError = (error) => {
  const message = error.message?.toLowerCase() || '';
  const code = error.code?.toLowerCase() || '';
  const responseCode = error.responseCode;

  if (message.includes('not initialized') || message.includes('not configured')) {
    return 'SMTP_NOT_CONFIGURED';
  }

  if (code === 'econnrefused' || code === 'enotfound' || code === 'etimedout') {
    return 'SMTP_CONNECTION_FAILED';
  }

  if (responseCode === 535 || message.includes('authentication') || message.includes('auth')) {
    return 'SMTP_AUTH_FAILED';
  }

  if (responseCode === 550 || responseCode === 551 || responseCode === 552 || responseCode === 553) {
    return 'RECIPIENT_REJECTED';
  }

  if (responseCode >= 400 && responseCode < 500) {
    return 'SMTP_TEMPORARY_FAILURE';
  }

  return 'SMTP_SEND_FAILED';
};

module.exports = {
  classifySmtpError,
};
