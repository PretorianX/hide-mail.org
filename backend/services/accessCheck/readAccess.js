/**
 * Read one email's HTML and name the barriers that keep someone from reading it.
 * The source is scored in memory and dropped. Nothing here writes to Redis or disk.
 */

const { htmlFromSource } = require('./htmlPart');
const { scanHtml } = require('./scanHtml');
const { AccessCheckError, fail } = require('./errors');

const MAX_SOURCE_CHARS = 64 * 1024;

const summaryFor = (stamp, barriers) => {
  if (stamp === 'CLEAR') {
    return 'No access barrier in this HTML.';
  }
  if (stamp === 'BLOCKED') {
    return 'This email is only an image, so a screen reader has nothing to read.';
  }
  const count = barriers.reduce((sum, item) => sum + item.count, 0);
  const names = barriers.map((item) => item.title.toLowerCase()).join(', ');
  return `${count} ${count === 1 ? 'barrier' : 'barriers'}: ${names}.`;
};

const readAccess = (source) => {
  if (typeof source !== 'string') {
    fail('NOT_HTML', 'Paste the HTML of an email, or a raw message that contains an HTML part.');
  }
  if (source.length > MAX_SOURCE_CHARS) {
    fail('ACCESS_TOO_LARGE', 'That email is larger than 64 KB.');
  }
  const html = htmlFromSource(source);
  const scanned = scanHtml(html);
  const blocked = scanned.barriers.some((item) => item.id === 'image-only');
  const stamp = blocked ? 'BLOCKED' : (scanned.barriers.length > 0 ? 'FIX' : 'CLEAR');
  const verdict = stamp.toLowerCase();
  const barrierCount = scanned.barriers.reduce((sum, item) => sum + item.count, 0);
  return {
    stored: false,
    stamp,
    verdict,
    summary: summaryFor(stamp, scanned.barriers),
    barrierCount,
    barriers: scanned.barriers,
  };
};

module.exports = {
  readAccess,
  AccessCheckError,
  MAX_SOURCE_CHARS,
};
