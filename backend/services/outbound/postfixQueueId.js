/**
 * Parse Postfix queue id from an SMTP DATA response.
 */

const QUEUED_AS_RE = /\bqueued as\s+([A-Za-z0-9]+)\b/i;

const parsePostfixQueueId = (response) => {
  if (!response || typeof response !== 'string') {
    return null;
  }
  const match = response.match(QUEUED_AS_RE);
  return match ? match[1] : null;
};

module.exports = {
  parsePostfixQueueId,
};
