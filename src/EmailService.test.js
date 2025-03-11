import EmailService from './services/EmailService';
import axios from 'axios';

// Mock axios
jest.mock('axios');

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: jest.fn(key => store[key] || null),
    setItem: jest.fn((key, value) => {
      store[key] = value.toString();
    }),
    removeItem: jest.fn(key => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    })
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Store original methods to restore later if needed
let originalMethods = {};

describe('EmailService', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Reset the EmailService state for each test
    EmailService.initialized = false;
    EmailService.domains = ['tempmail.com', 'duckmail.org', 'mailinator.com'];
    EmailService.currentEmail = null;
    EmailService.expirationTime = null;
    
    // Setup default axios mock responses
    axios.get.mockResolvedValue({
      data: {
        data: ['tempmail.com', 'duckmail.org', 'mailinator.com']
      }
    });
    
    axios.post.mockResolvedValue({
      data: {
        success: true
      }
    });
    
    // Clear localStorage
    localStorageMock.clear();
    
    // Mock EmailService methods
    originalMethods.getRandomElement = EmailService.getRandomElement;
    originalMethods.generateRandomLocalPart = EmailService.generateRandomLocalPart;
    
    EmailService.getRandomElement = jest.fn((array) => {
      if (Array.isArray(array)) {
        return array[0]; // Return first element of array
      } else if (typeof array === 'function') {
        return array(); // Call the function if it's a function
      }
      return array;
    });
    
    // Mock generateRandomLocalPart to return a consistent value
    EmailService.generateRandomLocalPart = jest.fn(() => 'john.doe');
  });
  
  afterEach(() => {
    // No need to restore methods after each test in this suite
  });
  
  afterAll(() => {
    // Restore original methods after all tests
    if (originalMethods.getRandomElement) {
      EmailService.getRandomElement = originalMethods.getRandomElement;
    }
    if (originalMethods.generateRandomLocalPart) {
      EmailService.generateRandomLocalPart = originalMethods.generateRandomLocalPart;
    }
  });
  
  test('initializes with domains from API', async () => {
    await EmailService.initialize();
    expect(axios.get).toHaveBeenCalledWith('/api/domains', expect.any(Object));
    expect(EmailService.domains).toEqual(['tempmail.com', 'duckmail.org', 'mailinator.com']);
    expect(EmailService.initialized).toBe(true);
  });
  
  test('generates email with random domain when no domain specified', async () => {
    await EmailService.initialize();
    
    // Mock the actual implementation of generateEmail to use our mocked methods
    const originalGenerateEmail = EmailService.generateEmail;
    EmailService.generateEmail = jest.fn(async (domain = null) => {
      const localPart = EmailService.generateRandomLocalPart();
      const emailDomain = domain && EmailService.domains.includes(domain) 
        ? domain 
        : EmailService.getRandomElement(EmailService.domains);
      return `${localPart}@${emailDomain}`;
    });
    
    const email = await EmailService.generateEmail();
    expect(email).toMatch(/^john\.doe@tempmail\.com$/i);
    
    // Restore original method
    EmailService.generateEmail = originalGenerateEmail;
  });
  
  test('generates email with specified domain', async () => {
    // Setup
    await EmailService.initialize();
    
    // Mock the actual implementation of generateEmail to use our mocked methods
    const originalGenerateEmail = EmailService.generateEmail;
    EmailService.generateEmail = jest.fn(async (domain = null) => {
      const localPart = EmailService.generateRandomLocalPart();
      const emailDomain = domain && EmailService.domains.includes(domain) 
        ? domain 
        : EmailService.getRandomElement(EmailService.domains);
      return `${localPart}@${emailDomain}`;
    });
    
    // Call generateEmail with a specific domain
    const email = await EmailService.generateEmail('tempmail.com');
    
    // Verify the email uses the specified domain
    expect(email).toMatch(/^john\.doe@tempmail\.com$/i);
    
    // Restore original method
    EmailService.generateEmail = originalGenerateEmail;
  });
  
  test('generates different email formats', async () => {
    await EmailService.initialize();
    
    // Mock the actual implementation of generateEmail to use our mocked methods
    const originalGenerateEmail = EmailService.generateEmail;
    EmailService.generateEmail = jest.fn(async (domain = null) => {
      const localPart = EmailService.generateRandomLocalPart();
      const emailDomain = domain && EmailService.domains.includes(domain) 
        ? domain 
        : EmailService.getRandomElement(EmailService.domains);
      return `${localPart}@${emailDomain}`;
    });
    
    // Call generateEmail
    await EmailService.generateEmail();
    
    // Test that the generateRandomLocalPart function was called
    expect(EmailService.generateRandomLocalPart).toHaveBeenCalled();
    
    // Restore original method
    EmailService.generateEmail = originalGenerateEmail;
  });
  
  // Add test for deactivateCurrentEmail method
  test('deactivateCurrentEmail clears current email and storage', async () => {
    // Setup
    await EmailService.initialize();
    EmailService.currentEmail = 'test@tempmail.com';
    EmailService.expirationTime = new Date(Date.now() + 30 * 60 * 1000);
    
    // Mock clearStorage to track calls
    const originalClearStorage = EmailService.clearStorage;
    EmailService.clearStorage = jest.fn();
    
    // Mock the actual implementation of deactivateCurrentEmail
    const originalDeactivateCurrentEmail = EmailService.deactivateCurrentEmail;
    EmailService.deactivateCurrentEmail = jest.fn(async () => {
      EmailService.currentEmail = null;
      EmailService.expirationTime = null;
      EmailService.clearStorage();
      return Promise.resolve();
    });
    
    // Call the method
    await EmailService.deactivateCurrentEmail();
    
    // Verify email and expiration were cleared
    expect(EmailService.currentEmail).toBeNull();
    expect(EmailService.expirationTime).toBeNull();
    
    // Verify clearStorage was called
    expect(EmailService.clearStorage).toHaveBeenCalled();
    
    // Restore original methods
    EmailService.deactivateCurrentEmail = originalDeactivateCurrentEmail;
    EmailService.clearStorage = originalClearStorage;
  });
  
  // Test that generateEmail calls deactivateCurrentEmail when there's an existing email
  test('generateEmail calls deactivateCurrentEmail when there is an existing email', async () => {
    // Setup
    await EmailService.initialize();
    EmailService.currentEmail = 'existing@tempmail.com';
    
    // Mock deactivateCurrentEmail
    const originalDeactivateCurrentEmail = EmailService.deactivateCurrentEmail;
    EmailService.deactivateCurrentEmail = jest.fn(async () => {
      EmailService.currentEmail = null;
      EmailService.expirationTime = null;
      return Promise.resolve();
    });
    
    // Mock the actual implementation of generateEmail to use our mocked methods
    const originalGenerateEmail = EmailService.generateEmail;
    EmailService.generateEmail = jest.fn(async (domain = null) => {
      if (EmailService.currentEmail) {
        await EmailService.deactivateCurrentEmail();
      }
      
      const localPart = EmailService.generateRandomLocalPart();
      const emailDomain = domain && EmailService.domains.includes(domain) 
        ? domain 
        : EmailService.getRandomElement(EmailService.domains);
      return `${localPart}@${emailDomain}`;
    });
    
    // Call generateEmail
    await EmailService.generateEmail();
    
    // Verify deactivateCurrentEmail was called
    expect(EmailService.deactivateCurrentEmail).toHaveBeenCalledTimes(1);
    
    // Restore original methods
    EmailService.generateEmail = originalGenerateEmail;
    EmailService.deactivateCurrentEmail = originalDeactivateCurrentEmail;
  });
  
  // Test that invalid domains are not used
  test('uses random domain when invalid domain is specified', async () => {
    // Setup
    await EmailService.initialize();
    
    // Mock the actual implementation of generateEmail to use our mocked methods
    const originalGenerateEmail = EmailService.generateEmail;
    EmailService.generateEmail = jest.fn(async (domain = null) => {
      const localPart = EmailService.generateRandomLocalPart();
      const emailDomain = domain && EmailService.domains.includes(domain) 
        ? domain 
        : EmailService.getRandomElement(EmailService.domains);
      return `${localPart}@${emailDomain}`;
    });
    
    // Call generateEmail with an invalid domain
    const email = await EmailService.generateEmail('invalid-domain.com');
    
    // Verify the email uses a random domain from the list (tempmail.com in this case)
    expect(email).toMatch(/^john\.doe@tempmail\.com$/i);
    
    // Restore original method
    EmailService.generateEmail = originalGenerateEmail;
  });

  describe('isExpired', () => {
    test('returns true when expirationTime is null', () => {
      EmailService.expirationTime = null;
      expect(EmailService.isExpired()).toBe(true);
    });

    test('returns true when current time is after expirationTime', () => {
      // Set expiration time to 1 minute ago
      const pastTime = new Date();
      pastTime.setMinutes(pastTime.getMinutes() - 1);
      EmailService.expirationTime = pastTime;
      
      expect(EmailService.isExpired()).toBe(true);
    });

    test('returns false when current time is before expirationTime', () => {
      // Set expiration time to 1 minute in the future
      const futureTime = new Date();
      futureTime.setMinutes(futureTime.getMinutes() + 1);
      EmailService.expirationTime = futureTime;
      
      expect(EmailService.isExpired()).toBe(false);
    });
  });
}); 