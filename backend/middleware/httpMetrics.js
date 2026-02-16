/**
 * Express middleware that records HTTP request metrics.
 *
 * Tracks request count and duration per method / route / status code.
 * Route is normalised to the Express route pattern (e.g. /api/emails/:email)
 * so high-cardinality path params don't explode label space.
 */

const {
  httpRequestsTotal,
  httpRequestDurationSeconds,
} = require('../services/metricsService');

const normaliseRoute = (req) => {
  if (req.route && req.route.path) {
    return req.baseUrl + req.route.path;
  }
  return req.path || 'unknown';
};

const httpMetricsMiddleware = (req, res, next) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationNs = Number(process.hrtime.bigint() - start);
    const durationSeconds = durationNs / 1e9;

    const route = normaliseRoute(req);
    const labels = {
      method: req.method,
      route,
      status_code: res.statusCode,
    };

    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, durationSeconds);
  });

  next();
};

module.exports = httpMetricsMiddleware;
