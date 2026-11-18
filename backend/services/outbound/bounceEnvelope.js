/**
 * VERP envelope helpers for outbound return-path addresses.
 * Generates and verifies HMAC-authenticated VERP bounce locals (`b-<id>.<mac>@...`).
 */

const crypto = require('crypto');
const config = require('../../config/config');

const BOUNCE_ENVELOPE_RE = /^b-([^@]+)@hm-bounce\.(.+)$/i;
const RETURN_PATH_LOCAL_RE = /^b-([^@]+)$/i;
const VERP_MAC_FORMAT_RE = /^[A-Za-z0-9_-]{16,44}$/;
const VERP_MAC_LENGTH = 22; // 128+ bits base64url; keeps b-<uuid>.<mac> <= 61 chars (RFC 5321 local-part limit 64)

const getVerpSecret = (secretOverride) => {
  const secret = secretOverride !== undefined ? secretOverride : config.outbound.keyEncryptionSecret;
  if (secret) {
    return secret;
  }
  if (process.env.NODE_ENV === 'test') {
    return 'test-verp-fallback-secret';
  }
  throw new Error('OUTBOUND_KEY_ENCRYPTION_SECRET is required for VERP HMAC');
};

const deriveVerpKey = (secret) =>
  crypto.createHmac('sha256', String(secret)).update('verp-bounce-v1').digest();

const splitVerpLocal = (rawLocal) => {
  const dotIdx = rawLocal.lastIndexOf('.');
  if (dotIdx > 0 && dotIdx < rawLocal.length - 1) {
    const macCandidate = rawLocal.slice(dotIdx + 1);
    if (VERP_MAC_FORMAT_RE.test(macCandidate)) {
      return {
        messageId: rawLocal.slice(0, dotIdx),
        mac: macCandidate,
      };
    }
  }
  return { messageId: rawLocal, mac: null };
};

const computeVerpMac = ({ messageId, accountId, domain, recipient }, secretOverride) => {
  const key = deriveVerpKey(getVerpSecret(secretOverride));
  const payload = [
    String(messageId || ''),
    String(accountId || ''),
    String(domain || '').trim().toLowerCase(),
    String(recipient || '').trim().toLowerCase(),
  ].join('|');

  return crypto
    .createHmac('sha256', key)
    .update(payload)
    .digest('base64url')
    .slice(0, VERP_MAC_LENGTH);
};

const buildBounceEnvelopeFrom = ({ messageId, accountId, domain, recipient }, secretOverride) => {
  const normalizedDomain = String(domain || '').trim().toLowerCase();
  const mac = computeVerpMac({ messageId, accountId, domain: normalizedDomain, recipient }, secretOverride);
  return `b-${messageId}.${mac}@hm-bounce.${normalizedDomain}`;
};

const verifyVerpMac = (parsed, message, secretOverride) => {
  if (!parsed || !parsed.mac || !message) {
    return false;
  }
  const expected = computeVerpMac(
    {
      messageId: message.id,
      accountId: message.accountId,
      domain: message.domain,
      recipient: message.recipient,
    },
    secretOverride
  );
  const actualBuf = Buffer.from(parsed.mac, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (actualBuf.length !== expectedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
};

const isLegacyVerpAllowed = () => process.env.OUTBOUND_VERP_ALLOW_LEGACY === 'true';

const parseBounceEnvelopeFrom = (from) => {
  if (!from || typeof from !== 'string') {
    return null;
  }
  const match = from.match(BOUNCE_ENVELOPE_RE);
  if (!match) {
    return null;
  }
  const { messageId, mac } = splitVerpLocal(match[1]);
  return { messageId, mac, domain: match[2].toLowerCase() };
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
  const { messageId, mac } = splitVerpLocal(localMatch[1]);
  return { messageId, mac, domain: null };
};

const isOutboundBounceRecipient = (address) => {
  const parsed = parseOutboundBounceRecipient(address);
  if (!parsed) {
    return false;
  }
  if (parsed.mac) {
    return true;
  }
  return isLegacyVerpAllowed();
};

module.exports = {
  computeVerpMac,
  buildBounceEnvelopeFrom,
  verifyVerpMac,
  isLegacyVerpAllowed,
  parseBounceEnvelopeFrom,
  parseOutboundBounceRecipient,
  isOutboundBounceRecipient,
};
