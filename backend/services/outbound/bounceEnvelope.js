/**
 * VERP envelope helpers for outbound return-path addresses.
 * Parses VERP-style bounce envelope locals (`b-<uuid>@…`).
 */

const BOUNCE_ENVELOPE_RE = /^b-([^@]+)@hm-bounce\.(.+)$/i;
const RETURN_PATH_LOCAL_RE = /^b-([^@]+)$/i;

const parseBounceEnvelopeFrom = (from) => {
  if (!from || typeof from !== 'string') {
    return null;
  }
  const match = from.match(BOUNCE_ENVELOPE_RE);
  if (!match) {
    return null;
  }
  return { messageId: match[1], domain: match[2].toLowerCase() };
};

const parseOutboundBounceRecipient = (address) => {
  const fromHmBounce = parseBounceEnvelopeFrom(address);
  if (fromHmBounce) {
    return fromHmBounce;
  }

  if (!address || typeof address !== 'string') {
    return null;
  }

  const at = address.lastIndexOf('@');
  if (at <= 0) {
    return null;
  }
  const local = address.slice(0, at);
  const host = address.slice(at + 1).toLowerCase();
  const target = String(process.env.OUTBOUND_RETURN_PATH_TARGET || '').trim().toLowerCase();
  if (!target || host !== target) {
    return null;
  }
  const localMatch = local.match(RETURN_PATH_LOCAL_RE);
  if (!localMatch) {
    return null;
  }
  return { messageId: localMatch[1], domain: null };
};

const isOutboundBounceRecipient = (address) => parseOutboundBounceRecipient(address) !== null;

module.exports = {
  parseBounceEnvelopeFrom,
  parseOutboundBounceRecipient,
  isOutboundBounceRecipient,
};
