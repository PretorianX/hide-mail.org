const crypto = require('crypto');

const GROUP_ID_PATTERN = /^[0-9a-f]{32}$/;

const HEADER = 'x-inbox-group';

/**
 * An inbox group is the only thing tying several live mailboxes together. It is minted by the
 * server rather than the browser so one visitor cannot pick a guessable id and then read or
 * release another visitor's slots. 128 bits is the same order as the license key.
 *
 * @returns {string} 32 lowercase hex characters
 */
const createGroupId = () => crypto.randomBytes(16).toString('hex');

const isValidGroupId = (value) =>
  typeof value === 'string' && GROUP_ID_PATTERN.test(value);

/**
 * The group a request claims to belong to, or null when it sends none. A malformed value is
 * treated as absent: nothing is stored under an id the server did not mint.
 *
 * @param {Object} headers - Express `req.headers`
 * @returns {string|null}
 */
const groupIdFromHeaders = (headers) => {
  const raw = headers ? headers[HEADER] : undefined;
  const value = String(raw === undefined || raw === null ? '' : raw).trim().toLowerCase();
  return isValidGroupId(value) ? value : null;
};

module.exports = {
  HEADER,
  createGroupId,
  isValidGroupId,
  groupIdFromHeaders,
};
