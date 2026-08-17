const logger = require('../utils/logger');
const redisService = require('./redisService');

const notifyMailboxWebhook = async (email, message, fetchImpl) => {
  const url = await redisService.getMailboxWebhook(email);
  if (!url) {
    return false;
  }

  const fetchFn = fetchImpl || fetch;
  try {
    await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mailbox: email,
        message: {
          id: message.id,
          from: message.from,
          subject: message.subject,
          receivedAt: message.receivedAt,
        },
      }),
    });
    return true;
  } catch (error) {
    logger.error(`QA webhook delivery failed for ${email}: ${error.message}`);
    return false;
  }
};

module.exports = {
  notifyMailboxWebhook,
};
