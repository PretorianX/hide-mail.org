/**
 * Mock for prom-client used in Jest tests.
 * Mirrors the prom-client API surface used by metricsService.
 */

class Counter {
  constructor() {
    this.inc = jest.fn();
  }
}

class Gauge {
  constructor() {
    this.set = jest.fn();
    this.inc = jest.fn();
    this.dec = jest.fn();
  }
}

class Histogram {
  constructor() {
    this.observe = jest.fn();
    this.startTimer = jest.fn(() => jest.fn());
  }
}

const register = {
  metrics: jest.fn().mockResolvedValue(''),
  contentType: 'text/plain; version=0.0.4; charset=utf-8',
  clear: jest.fn(),
};

module.exports = {
  Counter,
  Gauge,
  Histogram,
  register,
  collectDefaultMetrics: jest.fn(),
};
