class AccessCheckError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AccessCheckError';
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new AccessCheckError(code, message);
};

module.exports = {
  AccessCheckError,
  fail,
};
