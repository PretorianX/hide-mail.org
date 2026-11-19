const redisService = require('./redisService');

class MailboxOwnershipError extends Error {
  constructor(
    message = 'Mailbox does not belong to this license',
    statusCode = 403,
    code = 'MAILBOX_FORBIDDEN'
  ) {
    super(message);
    this.name = 'MailboxOwnershipError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Verifies that `email` is owned by `license`.
 * Loads `mailbox_meta:<email>` and requires `meta.licenseKey === license.key`.
 * Rejects missing metadata or a mismatched license key.
 */
const assertMailboxOwner = async (email, license) => {
  if (!license || !license.key) {
    throw new MailboxOwnershipError('Authentication required', 401, 'API_KEY_REQUIRED');
  }

  const meta = await redisService.getMailboxMeta(email);
  if (!meta || !meta.licenseKey || meta.licenseKey !== license.key) {
    throw new MailboxOwnershipError(
      'Mailbox does not belong to this license',
      403,
      'MAILBOX_FORBIDDEN'
    );
  }

  return meta;
};

module.exports = {
  MailboxOwnershipError,
  assertMailboxOwner,
};
