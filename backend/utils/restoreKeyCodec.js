/**
 * Restore key codec.
 *
 * A restore key is what a person retypes on a second device, so the alphabet drops the four
 * symbols that get misread by eye (I, L, O, U) and normalisation maps the substitutions people
 * make anyway. 12 symbols from 32 is 60 bits, which the redemption rate limiter backs up.
 */

const crypto = require('crypto');

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const PREFIX = 'HMR';
const GROUP_SIZE = 4;
const GROUPS = 3;
const KEY_LENGTH = GROUP_SIZE * GROUPS;

const SUBSTITUTIONS = { I: '1', L: '1', O: '0' };

const KEY_PATTERN = new RegExp(`^[${ALPHABET}]{${KEY_LENGTH}}$`);

/**
 * @returns {string} A new key in display form, e.g. `HMR-4F7K-2QMT-9XB3`.
 */
const generate = () => {
  const bytes = crypto.randomBytes(KEY_LENGTH);
  let key = '';
  for (let i = 0; i < KEY_LENGTH; i += 1) {
    key += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return format(key);
};

/**
 * Group a normalized key for display.
 * @param {string} key Normalized key.
 * @returns {string}
 */
function format(key) {
  const groups = [];
  for (let i = 0; i < key.length; i += GROUP_SIZE) {
    groups.push(key.slice(i, i + GROUP_SIZE));
  }
  return [PREFIX, ...groups].join('-');
}

/**
 * Reduce user input to the canonical storage form.
 * @param {*} input Whatever the client sent.
 * @returns {string|null} Canonical key, or null when the input cannot be one.
 */
const normalize = (input) => {
  if (typeof input !== 'string') {
    return null;
  }

  const stripped = input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(new RegExp(`^${PREFIX}`), '')
    .split('')
    .map((char) => SUBSTITUTIONS[char] || char)
    .join('');

  return KEY_PATTERN.test(stripped) ? stripped : null;
};

module.exports = {
  ALPHABET,
  KEY_LENGTH,
  PREFIX,
  generate,
  format,
  normalize,
};
