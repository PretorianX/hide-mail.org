/**
 * Tests for backend config module
 */

describe('config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset modules before each test to ensure fresh imports
    jest.resetModules();
    // Clone the original env
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    // Restore original env
    process.env = originalEnv;
  });

  describe('getEmailDomains', () => {
    it('should throw error when VALID_DOMAINS is not set', () => {
      delete process.env.VALID_DOMAINS;
      
      expect(() => {
        require('../../config/config');
      }).toThrow('Email domains not configured. Set VALID_DOMAINS environment variable.');
    });

    it('should parse single domain from VALID_DOMAINS', () => {
      process.env.VALID_DOMAINS = 'example.com';
      
      const config = require('../../config/config');
      
      expect(config.validDomains).toEqual(['example.com']);
    });

    it('should parse multiple domains from VALID_DOMAINS', () => {
      process.env.VALID_DOMAINS = 'domain1.com,domain2.com,domain3.com';
      
      const config = require('../../config/config');
      
      expect(config.validDomains).toEqual(['domain1.com', 'domain2.com', 'domain3.com']);
    });

    it('should trim whitespace from domain names', () => {
      process.env.VALID_DOMAINS = '  domain1.com  ,  domain2.com  ';
      
      const config = require('../../config/config');
      
      expect(config.validDomains).toEqual(['domain1.com', 'domain2.com']);
    });
  });

  describe('config defaults', () => {
    beforeEach(() => {
      process.env.VALID_DOMAINS = 'test.com';
    });

    it('should use default port 3001', () => {
      delete process.env.PORT;
      
      const config = require('../../config/config');
      
      expect(config.port).toBe(3001);
    });

    it('should use PORT from environment', () => {
      process.env.PORT = '4000';
      
      const config = require('../../config/config');
      
      expect(config.port).toBe('4000');
    });

    it('should use default SMTP port 2525', () => {
      delete process.env.SMTP_PORT;
      
      const config = require('../../config/config');
      
      expect(config.smtpPort).toBe(2525);
    });

    it('should use SMTP_PORT from environment', () => {
      process.env.SMTP_PORT = '25';
      
      const config = require('../../config/config');
      
      expect(config.smtpPort).toBe('25');
    });

    it('should use default Redis URL', () => {
      delete process.env.REDIS_URL;
      
      const config = require('../../config/config');
      
      expect(config.redisUrl).toBe('redis://localhost:6379');
    });

    it('should use REDIS_URL from environment', () => {
      process.env.REDIS_URL = 'redis://custom:6380';
      
      const config = require('../../config/config');
      
      expect(config.redisUrl).toBe('redis://custom:6380');
    });

    it('should use default email expiration of 30 minutes', () => {
      delete process.env.EMAIL_EXPIRATION;
      
      const config = require('../../config/config');
      
      expect(config.emailExpiration).toBe(30);
    });

    it('should use EMAIL_EXPIRATION from environment', () => {
      process.env.EMAIL_EXPIRATION = '60';
      
      const config = require('../../config/config');
      
      expect(config.emailExpiration).toBe(60);
    });

    it('should use default environment as development', () => {
      delete process.env.NODE_ENV;
      
      const config = require('../../config/config');
      
      expect(config.environment).toBe('development');
    });
  });
});

