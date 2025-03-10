// Set required environment variables for tests
process.env.API_BASE_URL = 'https://api.test.com';
process.env.HIDE_MAIL_API_KEY = 'test-api-key';
process.env.EMAIL_DOMAINS = 'domain1.com,domain2.com';

const redisService = require('../../services/redisService');
const emailController = require('../../controllers/emailController');
const emailService = require('../../services/emailService');
const config = require('../../config/config');

// Mock redisService
jest.mock('../../services/redisService');
// Mock emailService
jest.mock('../../services/emailService');
// Mock config
jest.mock('../../config/config', () => {
  const originalConfig = jest.requireActual('../../config/config');
  return {
    ...originalConfig,
    getEmailDomains: jest.fn().mockReturnValue(['domain1.com', 'domain2.com']),
    validDomains: ['domain1.com', 'domain2.com']
  };
});
// Mock ioredis is handled by jest.config.js

describe('emailController', () => {
  afterAll(() => {
    // Clean up any timers
    if (emailService.__cleanupTimers) {
      emailService.__cleanupTimers();
    }
    
    // Close any open handles
    jest.useRealTimers();
  });
  
  describe('getDomains', () => {
    it('should successfully fetch domains', async () => {
      const mockDomains = ['domain1.com', 'domain2.com'];
      
      // Mock the redisService.getDomains method
      redisService.getDomains.mockResolvedValueOnce(mockDomains);
      
      const req = {};
      const res = {
        json: jest.fn()
      };
      
      await emailController.getDomains(req, res);
      
      expect(redisService.getDomains).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        count: mockDomains.length,
        data: mockDomains
      });
    });

    it('should handle errors', async () => {
      // Mock the redisService.getDomains method to throw an error
      redisService.getDomains.mockRejectedValueOnce(new Error('Redis error'));
      
      const req = {};
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      
      await emailController.getDomains(req, res);
      
      expect(redisService.getDomains).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to fetch domains'
      });
    });
  });
}); 