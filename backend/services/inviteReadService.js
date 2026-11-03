/**
 * Invite Read. Turns one meeting request into who asked, when, and whether
 * to accept, update, or drop it. The browser report and the paid API share this reader.
 */

const { readInvite, InviteReadError } = require('./inviteRead/readInvite');

module.exports = {
  readInvite,
  InviteReadError,
};
