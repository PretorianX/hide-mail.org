/**
 * RCPT TO gate for outbound late-bounce VERP addresses.
 * Kept thin so server.js does not own envelope regex details.
 */

const { isOutboundBounceRecipient } = require('./bounceEnvelope');

const shouldAcceptOutboundBounceRcpt = (address) => isOutboundBounceRecipient(address);

module.exports = {
  shouldAcceptOutboundBounceRcpt,
};
