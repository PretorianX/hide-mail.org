// Set required environment variables for tests
process.env.API_BASE_URL = 'https://api.test.com';
process.env.HIDE_MAIL_API_KEY = 'test-api-key';
process.env.VALID_DOMAINS = 'domain1.com,domain2.com';

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
      
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        count: 2,
        data: ['domain1.com', 'domain2.com'],
        premium: [],
      });
    });

    it('should handle errors', async () => {
      const entitlementService = require('../../services/entitlementService');
      const req = {};
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const spy = jest.spyOn(entitlementService, 'getEntitlements').mockImplementation(() => {
        throw new Error('Redis error');
      });
      
      await emailController.getDomains(req, res);

      spy.mockRestore();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to fetch domains'
      });
    });
  });

  describe('attachment metadata', () => {
    const storedMessage = () => ({
      id: 'msg-1',
      from: 'billing@shop.test',
      subject: 'Your invoice',
      attachments: [
        {
          filename: 'invoice.pdf',
          contentType: 'application/pdf',
          contentDisposition: 'attachment',
          cid: null,
          content: Buffer.from('pdf-bytes').toString('base64'),
          encoding: 'base64',
        },
      ],
    });

    const expectedMetadata = [
      {
        index: 0,
        filename: 'invoice.pdf',
        contentType: 'application/pdf',
        size: Buffer.byteLength('pdf-bytes'),
        inline: false,
      },
    ];

    it('lists attachments as metadata instead of base64 content', async () => {
      redisService.getEmails.mockResolvedValueOnce([storedMessage()]);
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await emailController.getEmails({ params: { email: 'a@domain1.com' } }, res);

      const [payload] = res.json.mock.calls[0];
      expect(payload.data[0].attachments).toEqual(expectedMetadata);
    });

    it('describes attachments on a single message without base64 content', async () => {
      redisService.getEmailById.mockResolvedValueOnce(storedMessage());
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await emailController.getEmailById(
        { params: { email: 'a@domain1.com', id: 'msg-1' } },
        res
      );

      const [payload] = res.json.mock.calls[0];
      expect(payload.data.attachments).toEqual(expectedMetadata);
      expect(payload.data.subject).toBe('Your invoice');
    });
  });
}); 