const config = require('../config/config');
const logger = require('../utils/logger');

/**
 * Global Express error-handling middleware.
 * Produces a consistent JSON error envelope across CORS denials,
 * malformed JSON bodies, client 4xx errors, and unexpected 500s.
 */
const errorHandler = (err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  logger.error(`Error [${req.correlationId}]: ${err.message}`);

  const isProduction = config.environment === 'production';
  const isClientError = status >= 400 && status < 500;
  const isMalformedJson = err.type === 'entity.parse.failed';

  const message = isMalformedJson
    ? 'Malformed JSON body'
    : (isClientError || !isProduction ? (err.message || 'Internal Server Error') : 'Internal Server Error');

  const code = err.code
    || (isMalformedJson ? 'INVALID_JSON' : (isClientError ? 'BAD_REQUEST' : 'INTERNAL_ERROR'));

  res.status(status).json({
    success: false,
    error: message,
    code,
    correlationId: req.correlationId,
  });
};

module.exports = { errorHandler };
