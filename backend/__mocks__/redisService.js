// Mock implementation of redisService.js
const redisService = {
  // Domain operations
  initializeDomains: jest.fn().mockResolvedValue(true),
  getDomains: jest.fn().mockResolvedValue(['test.com', 'test.org']),
  isDomainValid: jest.fn().mockResolvedValue(true),
  
  // Mailbox operations
  registerMailbox: jest.fn().mockResolvedValue(true),
  isMailboxActive: jest.fn().mockResolvedValue(true),
  refreshMailbox: jest.fn().mockResolvedValue(true),
  deactivateMailbox: jest.fn().mockResolvedValue(true),
  
  // Email operations
  storeEmail: jest.fn().mockResolvedValue('email-id-123'),
  getEmails: jest.fn().mockResolvedValue([
    { id: '1', subject: 'Test Email', from: 'sender@example.com' }
  ]),
  getEmailById: jest.fn().mockResolvedValue({
    id: '1',
    subject: 'Test Email',
    from: 'sender@example.com',
    to: 'recipient@test.com',
    text: 'This is a test email',
    html: '<p>This is a test email</p>',
    date: new Date().toISOString()
  }),
  deleteEmail: jest.fn().mockResolvedValue(true),
  deleteAllEmails: jest.fn().mockResolvedValue(true)
};

module.exports = redisService; 