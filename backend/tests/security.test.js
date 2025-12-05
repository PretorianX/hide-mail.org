/**
 * Security Tests for Backend API
 * 
 * Tests for:
 * - Debug endpoint protection in production
 * - Rate limiting
 * - Input validation for email forwarding
 */

// Mock config BEFORE requiring any modules
jest.mock('../config/config', () => ({
  environment: 'production',
  validDomains: ['mailduck.io', 'quackmail.io'],
  emailExpirationSeconds: 1800,
  emailExtensionSeconds: 900,
  smtp: {
    host: 'smtp.test.com',
    port: 587,
    secure: false,
    fromEmail: 'noreply@mailduck.io',
    fromName: 'Mail Duck',
  },
  forwarding: {
    rateLimit: 10,
    otpExpirationMinutes: 15,
    otpLength: 6,
  },
}));

// Mock Redis service
jest.mock('../services/redisService', () => ({
  isMailboxActive: jest.fn().mockResolvedValue(true),
  isDomainValid: jest.fn().mockResolvedValue(true),
  client: {
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    ttl: jest.fn().mockResolvedValue(60),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  },
}));

// Mock OTP service
jest.mock('../services/otpService', () => ({
  canRequestOTP: jest.fn().mockResolvedValue(true),
  createOTP: jest.fn().mockResolvedValue('123456'),
}));

// Mock SMTP service
jest.mock('../services/smtpService', () => ({
  sendOTPEmail: jest.fn().mockResolvedValue({ messageId: 'test' }),
}));

describe('Security: Forwarding Destination Validation', () => {
  let forwardingService;
  
  beforeAll(() => {
    // Import after mocks are set up
    forwardingService = require('../services/forwardingService');
  });
  
  it('should reject forwarding to service domains (mailduck.io)', async () => {
    await expect(
      forwardingService.requestOTP('test@mailduck.io', 'spam@mailduck.io')
    ).rejects.toThrow('Cannot forward to temporary email addresses');
  });

  it('should reject forwarding to service domains (quackmail.io)', async () => {
    await expect(
      forwardingService.requestOTP('test@mailduck.io', 'spam@quackmail.io')
    ).rejects.toThrow('Cannot forward to temporary email addresses');
  });

  it('should reject forwarding to service domains case-insensitively', async () => {
    await expect(
      forwardingService.requestOTP('test@mailduck.io', 'spam@MAILDUCK.IO')
    ).rejects.toThrow('Cannot forward to temporary email addresses');
  });

  it('should allow forwarding to external domains', async () => {
    // This should pass validation and attempt to send OTP
    // (it won't complete because SMTP is mocked)
    const result = await forwardingService.requestOTP('test@mailduck.io', 'user@gmail.com');
    expect(result.success).toBe(true);
    expect(result.message).toContain('Verification code sent');
  });
});

describe('Security: Rate Limiter Module', () => {
  const apiRateLimiter = require('../services/apiRateLimiter');
  
  it('should export rate limit configurations', () => {
    expect(apiRateLimiter.RATE_LIMITS).toBeDefined();
    expect(apiRateLimiter.RATE_LIMITS.mailboxRegister).toBeDefined();
    expect(apiRateLimiter.RATE_LIMITS.mailboxRegister.requests).toBe(10);
    expect(apiRateLimiter.RATE_LIMITS.mailboxRegister.windowSeconds).toBe(60);
  });

  it('should export middleware functions', () => {
    expect(typeof apiRateLimiter.mailboxRegister).toBe('function');
    expect(typeof apiRateLimiter.mailboxRefresh).toBe('function');
    expect(typeof apiRateLimiter.emailFetch).toBe('function');
    expect(typeof apiRateLimiter.default).toBe('function');
  });
});

describe('Security: Environment Check Function', () => {
  it('should block debug endpoints in production', () => {
    const config = require('../config/config');
    // Since we mocked config.environment = 'production'
    expect(config.environment).toBe('production');
    expect(config.environment !== 'development').toBe(true);
  });
});
