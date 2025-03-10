// Mock implementation of EmailService for testing
const EmailService = {
  domains: ['tempmail.com', 'duckmail.org', 'mailinator.com'],
  initialized: false,
  currentEmail: null,
  expirationTime: null,

  initialize: jest.fn(async () => {
    EmailService.initialized = true;
    return Promise.resolve();
  }),

  getRandomElement: jest.fn((array) => {
    if (Array.isArray(array)) {
      return array[0];
    } else if (typeof array === 'function') {
      return array();
    }
    return array;
  }),

  generateRandomLocalPart: jest.fn(() => {
    return 'john.doe';
  }),

  generateEmail: jest.fn(async (domain = null) => {
    const emailDomain = domain && EmailService.domains.includes(domain) 
      ? domain 
      : 'tempmail.com';
    
    const email = `john.doe@${emailDomain}`;
    EmailService.currentEmail = email;
    EmailService.expirationTime = new Date(Date.now() + 30 * 60 * 1000);
    
    return email;
  }),

  deactivateCurrentEmail: jest.fn(async () => {
    console.log(`Deactivated email: ${EmailService.currentEmail}`);
    EmailService.currentEmail = null;
    EmailService.expirationTime = null;
    return Promise.resolve();
  }),

  getAvailableDomains: jest.fn(async () => {
    await EmailService.initialize();
    return EmailService.domains;
  }),

  loadFromStorage: jest.fn(() => {}),
  saveToStorage: jest.fn(() => {}),
  clearStorage: jest.fn(() => {})
};

export default EmailService; 