/**
 * Tests for HTTP Metrics Middleware
 */

process.env.VALID_DOMAINS = 'test.com';

// Mock logger
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const httpMetricsMiddleware = require('../../middleware/httpMetrics');
const metrics = require('../../services/metricsService');

describe('httpMetricsMiddleware', () => {
  it('should call next() immediately', () => {
    const req = { method: 'GET', path: '/api/test' };
    const res = { on: jest.fn(), statusCode: 200 };
    const next = jest.fn();

    httpMetricsMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should register a finish listener on the response', () => {
    const req = { method: 'GET', path: '/api/test' };
    const res = { on: jest.fn(), statusCode: 200 };
    const next = jest.fn();

    httpMetricsMiddleware(req, res, next);

    expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
  });

  it('should increment counters when response finishes', () => {
    const req = {
      method: 'GET',
      path: '/api/emails/test@example.com',
      route: { path: '/emails/:email' },
      baseUrl: '/api',
    };

    let finishCallback;
    const res = {
      on: jest.fn((event, cb) => {
        if (event === 'finish') finishCallback = cb;
      }),
      statusCode: 200,
    };
    const next = jest.fn();

    httpMetricsMiddleware(req, res, next);

    // Simulate response finish
    finishCallback();

    expect(metrics.httpRequestsTotal.inc).toHaveBeenCalledWith({
      method: 'GET',
      route: '/api/emails/:email',
      status_code: 200,
    });
    expect(metrics.httpRequestDurationSeconds.observe).toHaveBeenCalledWith(
      { method: 'GET', route: '/api/emails/:email', status_code: 200 },
      expect.any(Number),
    );
  });

  it('should use req.path when no route is matched', () => {
    const req = { method: 'GET', path: '/health' };

    let finishCallback;
    const res = {
      on: jest.fn((event, cb) => {
        if (event === 'finish') finishCallback = cb;
      }),
      statusCode: 200,
    };
    const next = jest.fn();

    httpMetricsMiddleware(req, res, next);
    finishCallback();

    expect(metrics.httpRequestsTotal.inc).toHaveBeenCalledWith(
      expect.objectContaining({ route: '/health' }),
    );
  });
});
