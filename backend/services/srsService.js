/**
 * SRS (Sender Rewriting Scheme) Service for Forward & Forget Feature
 * 
 * Implements SRS to maintain SPF alignment when forwarding emails.
 * Uses the SRS0 format: SRS0=hash=timestamp=domain=local@SRS_DOMAIN
 * 
 * Configuration via environment variables:
 * - SRS_DOMAIN: Domain for SRS rewriting (required)
 * - SRS_SECRET: Secret key for HMAC hashing (required)
 * 
 * Reference: RFC 5321, SRS specification
 */

const crypto = require('crypto');
const logger = require('../utils/logger');
const config = require('../config/config');

// Base32 encoding table for timestamp (compact representation)
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encode a number to base32 string (2 characters for days since epoch)
 * @param {number} timestamp - Unix timestamp
 * @returns {string} - Base32 encoded days
 */
const encodeTimestamp = (timestamp) => {
  // Use days since a reference epoch (2024-01-01) for compact representation
  const referenceEpoch = new Date('2024-01-01').getTime();
  const days = Math.floor((timestamp - referenceEpoch) / (24 * 60 * 60 * 1000));
  
  // Encode to 2 base32 characters (allows ~1024 days range)
  const char1 = BASE32_CHARS[Math.floor(days / 32) % 32];
  const char2 = BASE32_CHARS[days % 32];
  
  return char1 + char2;
};

/**
 * Decode a base32 timestamp string to approximate Unix timestamp
 * @param {string} encoded - Base32 encoded days
 * @returns {number} - Approximate Unix timestamp
 */
const decodeTimestamp = (encoded) => {
  if (encoded.length !== 2) {
    throw new Error('Invalid timestamp encoding');
  }
  
  const char1 = BASE32_CHARS.indexOf(encoded[0].toUpperCase());
  const char2 = BASE32_CHARS.indexOf(encoded[1].toUpperCase());
  
  if (char1 === -1 || char2 === -1) {
    throw new Error('Invalid timestamp characters');
  }
  
  const days = char1 * 32 + char2;
  const referenceEpoch = new Date('2024-01-01').getTime();
  
  return referenceEpoch + days * 24 * 60 * 60 * 1000;
};

/**
 * Generate HMAC hash for SRS address
 * @param {string} data - Data to hash (timestamp + original address parts)
 * @returns {string} - First 4 characters of base64 hash
 */
const generateHash = (data) => {
  if (!config.srs?.secret) {
    throw new Error('SRS secret not configured');
  }
  
  const hmac = crypto.createHmac('sha1', config.srs.secret);
  hmac.update(data);
  const hash = hmac.digest('base64');
  
  // Use first 4 characters, replacing + and / for email safety
  return hash.substring(0, 4).replace(/\+/g, '-').replace(/\//g, '_');
};

/**
 * Verify HMAC hash for SRS address
 * @param {string} hash - Hash to verify
 * @param {string} data - Original data
 * @returns {boolean} - True if hash is valid
 */
const verifyHash = (hash, data) => {
  const expectedHash = generateHash(data);
  return crypto.timingSafeEqual(
    Buffer.from(hash),
    Buffer.from(expectedHash)
  );
};

/**
 * Encode an email address using SRS0 format
 * @param {string} originalAddress - Original sender email address
 * @returns {string} - SRS-encoded address
 */
const encode = (originalAddress) => {
  if (!config.srs?.domain) {
    throw new Error('SRS domain not configured');
  }

  // Parse original address
  const atIndex = originalAddress.lastIndexOf('@');
  if (atIndex === -1) {
    throw new Error('Invalid email address');
  }
  
  const localPart = originalAddress.substring(0, atIndex);
  const domain = originalAddress.substring(atIndex + 1);
  
  // Generate timestamp
  const timestamp = encodeTimestamp(Date.now());
  
  // Generate hash
  const hashData = `${timestamp}${domain}${localPart}`;
  const hash = generateHash(hashData);
  
  // Build SRS0 address: SRS0=hash=timestamp=domain=local@SRS_DOMAIN
  const srsLocal = `SRS0=${hash}=${timestamp}=${domain}=${localPart}`;
  const srsAddress = `${srsLocal}@${config.srs.domain}`;
  
  logger.debug(`SRS: Encoded ${originalAddress} -> ${srsAddress}`);
  
  return srsAddress;
};

/**
 * Decode an SRS-encoded email address
 * @param {string} srsAddress - SRS-encoded address
 * @returns {Object} - Decoded address info
 */
const decode = (srsAddress) => {
  // Parse SRS address
  const atIndex = srsAddress.lastIndexOf('@');
  if (atIndex === -1) {
    throw new Error('Invalid SRS address');
  }
  
  const srsLocal = srsAddress.substring(0, atIndex);
  const srsDomain = srsAddress.substring(atIndex + 1);
  
  // Verify domain matches our SRS domain
  if (srsDomain.toLowerCase() !== config.srs?.domain?.toLowerCase()) {
    throw new Error('SRS domain mismatch');
  }
  
  // Parse SRS0 format: SRS0=hash=timestamp=domain=local
  const srsMatch = srsLocal.match(/^SRS0=([^=]+)=([^=]+)=([^=]+)=(.+)$/i);
  if (!srsMatch) {
    throw new Error('Invalid SRS0 format');
  }
  
  const [, hash, timestamp, originalDomain, originalLocal] = srsMatch;
  
  // Verify hash
  const hashData = `${timestamp}${originalDomain}${originalLocal}`;
  if (!verifyHash(hash, hashData)) {
    throw new Error('Invalid SRS hash');
  }
  
  // Check timestamp validity (allow 30 days)
  const timestampMs = decodeTimestamp(timestamp);
  const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
  if (Date.now() - timestampMs > maxAge) {
    throw new Error('SRS address expired');
  }
  
  const originalAddress = `${originalLocal}@${originalDomain}`;
  
  logger.debug(`SRS: Decoded ${srsAddress} -> ${originalAddress}`);
  
  return {
    originalAddress,
    originalLocal,
    originalDomain,
    timestamp: timestampMs,
  };
};

/**
 * Check if an address is SRS-encoded
 * @param {string} address - Email address to check
 * @returns {boolean} - True if SRS-encoded
 */
const isSrsAddress = (address) => {
  return /^SRS[01]=.+@.+$/i.test(address);
};

/**
 * Rewrite email headers for forwarding with SRS
 * @param {Object} email - Email object with from, returnPath, etc.
 * @returns {Object} - Email object with rewritten addresses
 */
const rewriteForForwarding = (email) => {
  // Extract the email address from "Name <email@domain.com>" format
  const fromMatch = email.from.match(/<([^>]+)>/) || [null, email.from];
  const fromAddress = fromMatch[1] || email.from;
  
  // Encode the from address using SRS
  const srsFrom = encode(fromAddress.trim());
  
  return {
    ...email,
    srsFrom,
    originalFrom: email.from,
  };
};

/**
 * Check if SRS is properly configured
 * @returns {boolean} - True if SRS is configured
 */
const isConfigured = () => {
  return Boolean(config.srs?.domain && config.srs?.secret);
};

module.exports = {
  encode,
  decode,
  isSrsAddress,
  rewriteForForwarding,
  isConfigured,
  encodeTimestamp,
  decodeTimestamp,
  generateHash,
};

