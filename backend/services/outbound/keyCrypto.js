const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

const deriveKey = (secret) => crypto.createHash('sha256').update(secret).digest();

const encrypt = (plaintext, secret) => {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, deriveKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `gcm:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
};

const decrypt = (encoded, secret) => {
  const parts = encoded.split(':');
  if (parts.length !== 4 || parts[0] !== 'gcm') {
    throw new Error('Invalid encrypted value format');
  }

  const [, ivHex, authTagHex, cipherHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
    throw new Error('Invalid encrypted value format');
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    deriveKey(secret),
    iv,
    { authTagLength: AUTH_TAG_BYTES }
  );
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(Buffer.from(cipherHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
};

module.exports = {
  encrypt,
  decrypt,
};
