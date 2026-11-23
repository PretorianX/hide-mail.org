/**
 * Access Check. Names the barriers that keep an email's HTML from being read.
 * The browser report and the paid API share this reader.
 */

const { readAccess, AccessCheckError } = require('./accessCheck/readAccess');

module.exports = {
  readAccess,
  AccessCheckError,
};
