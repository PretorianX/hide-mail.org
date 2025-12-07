/**
 * Tests for sanitization utilities
 */

const {
  sanitizeForLog,
  sanitizeEmail,
  sanitizeIP,
  sanitizeMessageId,
} = require('../../utils/sanitize');

describe('Sanitization Utilities', () => {
  describe('sanitizeForLog', () => {
    test('handles null and undefined', () => {
      expect(sanitizeForLog(null)).toBe('null');
      expect(sanitizeForLog(undefined)).toBe('undefined');
    });

    test('handles normal strings unchanged', () => {
      expect(sanitizeForLog('hello world')).toBe('hello world');
      expect(sanitizeForLog('test@example.com')).toBe('test@example.com');
    });

    test('escapes newline characters', () => {
      expect(sanitizeForLog('line1\nline2')).toBe('line1\\nline2');
      expect(sanitizeForLog('line1\rline2')).toBe('line1\\rline2');
      expect(sanitizeForLog('line1\r\nline2')).toBe('line1\\r\\nline2');
    });

    test('escapes tab characters', () => {
      expect(sanitizeForLog('col1\tcol2')).toBe('col1\\tcol2');
    });

    test('escapes other control characters', () => {
      // Bell character (\x07)
      expect(sanitizeForLog('test\x07alert')).toBe('test\\x07alert');
      // Null character
      expect(sanitizeForLog('test\x00null')).toBe('test\\x00null');
      // Escape character
      expect(sanitizeForLog('test\x1bescape')).toBe('test\\x1bescape');
    });

    test('prevents log injection attacks', () => {
      // Attacker tries to forge a log entry
      const maliciousInput = 'user@example.com\n2025-12-07 [info]: Fake admin login succeeded';
      const sanitized = sanitizeForLog(maliciousInput);
      
      expect(sanitized).not.toContain('\n');
      expect(sanitized).toBe('user@example.com\\n2025-12-07 [info]: Fake admin login succeeded');
    });

    test('handles numbers and booleans by converting to string', () => {
      expect(sanitizeForLog(123)).toBe('123');
      expect(sanitizeForLog(true)).toBe('true');
      expect(sanitizeForLog(false)).toBe('false');
    });

    test('handles objects by converting to string', () => {
      expect(sanitizeForLog({})).toBe('[object Object]');
      expect(sanitizeForLog([])).toBe('');
    });
  });

  describe('sanitizeEmail', () => {
    test('sanitizes email addresses', () => {
      expect(sanitizeEmail('test@example.com')).toBe('test@example.com');
      expect(sanitizeEmail('malicious@example.com\nFake entry')).toBe('malicious@example.com\\nFake entry');
    });
  });

  describe('sanitizeIP', () => {
    test('sanitizes IP addresses', () => {
      expect(sanitizeIP('192.168.1.1')).toBe('192.168.1.1');
      expect(sanitizeIP('::1')).toBe('::1');
      expect(sanitizeIP('192.168.1.1\nFake entry')).toBe('192.168.1.1\\nFake entry');
    });
  });

  describe('sanitizeMessageId', () => {
    test('sanitizes message IDs', () => {
      expect(sanitizeMessageId('abc123')).toBe('abc123');
      expect(sanitizeMessageId('<msg@example.com>')).toBe('<msg@example.com>');
      expect(sanitizeMessageId('msg123\nFake entry')).toBe('msg123\\nFake entry');
    });
  });
});
