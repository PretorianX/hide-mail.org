// Mock implementation of emailService.js
const emailService = {
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
  
  deleteAllEmails: jest.fn().mockResolvedValue(true),
  
  registerMailbox: jest.fn().mockResolvedValue(true),
  
  refreshMailbox: jest.fn().mockResolvedValue(true),
  
  isMailboxActive: jest.fn().mockResolvedValue(true),
  
  deactivateMailbox: jest.fn().mockResolvedValue(true),
  
  // Add a cleanup method for tests
  __cleanupTimers: () => {
    // This will be called in afterAll
  }
};

module.exports = emailService; 