class InviteReadError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'InviteReadError';
    this.code = code;
  }
}

module.exports = { InviteReadError };
