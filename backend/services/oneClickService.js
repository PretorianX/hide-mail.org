/**
 * One-Click. Decides whether a mailing lets someone unsubscribe with one POST.
 * The browser check and the paid API share this reader. The message is not stored.
 */

const { judgeOneClick, OneClickError } = require('./oneClick/judgeHeaders');

module.exports = {
  readOneClick: judgeOneClick,
  OneClickError,
};
