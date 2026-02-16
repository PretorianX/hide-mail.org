/**
 * Tests for Prometheus Metrics Service
 */

process.env.VALID_DOMAINS = 'test.com';
process.env.METRICS_PORT = '0'; // Use random port in tests

// Mock logger
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const metrics = require('../../services/metricsService');

describe('metricsService', () => {
  describe('counter exports', () => {
    it('should export mailbox counters', () => {
      expect(metrics.mailboxesRegisteredTotal).toBeDefined();
      expect(typeof metrics.mailboxesRegisteredTotal.inc).toBe('function');

      expect(metrics.mailboxesRefreshedTotal).toBeDefined();
      expect(typeof metrics.mailboxesRefreshedTotal.inc).toBe('function');

      expect(metrics.mailboxesDeactivatedTotal).toBeDefined();
      expect(typeof metrics.mailboxesDeactivatedTotal.inc).toBe('function');
    });

    it('should export SMTP counters', () => {
      expect(metrics.smtpConnectionsTotal).toBeDefined();
      expect(typeof metrics.smtpConnectionsTotal.inc).toBe('function');

      expect(metrics.smtpRecipientsAcceptedTotal).toBeDefined();
      expect(metrics.smtpRecipientsRejectedTotal).toBeDefined();
      expect(metrics.emailsReceivedTotal).toBeDefined();
      expect(metrics.emailsStoredTotal).toBeDefined();
      expect(metrics.emailsDroppedTotal).toBeDefined();
      expect(metrics.smtpErrorsTotal).toBeDefined();
    });

    it('should export email size histogram', () => {
      expect(metrics.emailSizeBytes).toBeDefined();
      expect(typeof metrics.emailSizeBytes.observe).toBe('function');
    });

    it('should export forwarding counters', () => {
      expect(metrics.forwardingOtpRequestsTotal).toBeDefined();
      expect(metrics.forwardingOtpVerificationsTotal).toBeDefined();
      expect(metrics.forwardingEmailsTotal).toBeDefined();
    });

    it('should export HTTP counters', () => {
      expect(metrics.httpRequestsTotal).toBeDefined();
      expect(metrics.httpRequestDurationSeconds).toBeDefined();
    });

    it('should export redis connectivity gauge', () => {
      expect(metrics.redisConnected).toBeDefined();
      expect(typeof metrics.redisConnected.set).toBe('function');
    });
  });

  describe('server lifecycle', () => {
    it('should export startMetricsServer function', () => {
      expect(typeof metrics.startMetricsServer).toBe('function');
    });

    it('should export stopMetricsServer function', () => {
      expect(typeof metrics.stopMetricsServer).toBe('function');
    });
  });

  describe('counter operations', () => {
    it('should increment mailbox registration counter without error', () => {
      expect(() => metrics.mailboxesRegisteredTotal.inc()).not.toThrow();
    });

    it('should increment SMTP counters with labels without error', () => {
      expect(() => metrics.smtpRecipientsRejectedTotal.inc({ reason: 'invalid_domain' })).not.toThrow();
      expect(() => metrics.emailsDroppedTotal.inc({ reason: 'catch-all mode' })).not.toThrow();
    });

    it('should observe email size histogram without error', () => {
      expect(() => metrics.emailSizeBytes.observe(1024)).not.toThrow();
    });

    it('should set redis connected gauge without error', () => {
      expect(() => metrics.redisConnected.set(1)).not.toThrow();
      expect(() => metrics.redisConnected.set(0)).not.toThrow();
    });

    it('should increment forwarding counters with labels without error', () => {
      expect(() => metrics.forwardingOtpVerificationsTotal.inc({ result: 'success' })).not.toThrow();
      expect(() => metrics.forwardingOtpVerificationsTotal.inc({ result: 'failed' })).not.toThrow();
      expect(() => metrics.forwardingEmailsTotal.inc({ result: 'success' })).not.toThrow();
      expect(() => metrics.forwardingEmailsTotal.inc({ result: 'failed' })).not.toThrow();
    });
  });
});
