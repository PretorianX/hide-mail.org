const request = require('supertest');
const { app } = require('../__mocks__/server');
const emailService = require('../services/emailService');

// Mock the emailService
jest.mock('../services/emailService');
// Mock ioredis is handled by jest.config.js

describe('Email API Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  afterAll(() => {
    // Clean up any timers
    if (emailService.__cleanupTimers) {
      emailService.__cleanupTimers();
    }
    
    // Close any open handles
    jest.useRealTimers();
  });

  describe('GET /api/emails/:email', () => {
    it('should return emails for a valid email address', async () => {
      const mockEmails = [
        { id: '1', subject: 'Test Email', from: 'sender@example.com' }
      ];
      
      emailService.getEmails.mockResolvedValue(mockEmails);
      
      const res = await request(app)
        .get('/api/emails/test@mailduck.io')
        .expect(200);
      
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockEmails);
      expect(emailService.getEmails).toHaveBeenCalledWith('test@mailduck.io');
    });

    it('should return 400 for invalid email address', async () => {
      const res = await request(app)
        .get('/api/emails/invalid-email')
        .expect(400);
      
      expect(res.body.error).toBe('Invalid email address');
      expect(emailService.getEmails).not.toHaveBeenCalled();
    });
  });

  // Add more tests for other endpoints
}); 