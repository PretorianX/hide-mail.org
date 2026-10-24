/**
 * Complaint Read. Turns one abuse feedback report into the address to act on.
 * The browser report and the paid API share this reader.
 */

const { readComplaint, ComplaintReadError } = require('./complaintRead/readReport');

module.exports = {
  readComplaint,
  ComplaintReadError,
};
