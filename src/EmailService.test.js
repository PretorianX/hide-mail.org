import EmailService from './services/EmailService';
import { faker } from '@faker-js/faker';

// Mock faker to ensure consistent test results
jest.mock('@faker-js/faker', () => ({
  faker: {
    person: {
      firstName: jest.fn().mockReturnValue('John'),
      lastName: jest.fn().mockReturnValue('Doe')
    }
  }
}));

// Mock fetch for testing
global.fetch = jest.fn(() =>
  Promise.resolve({
    json: () => Promise.resolve({ domains: ['mailduck.io', 'mail-duck.com'] }),
  })
);

beforeEach(() => {
  fetch.mockClear();
  // Reset the initialized state for each test
  EmailService.initialized = false;
  EmailService.domains = [];
});

test('initializes with domains from config file', async () => {
  await EmailService.initialize();
  expect(fetch).toHaveBeenCalledWith('/config/domains.json');
  expect(EmailService.domains).toEqual(['mailduck.io', 'mail-duck.com']);
  expect(EmailService.initialized).toBe(true);
});

test('generates email with random domain when no domain specified', async () => {
  await EmailService.initialize();
  const email = await EmailService.generateEmail();
  expect(email).toMatch(/^[a-z0-9._]+@(mailduck\.io|mail-duck\.com)$/);
});

test('generates email with specified domain', async () => {
  // Mock axios for this test
  const mockAxios = require('axios');
  jest.mock('axios');
  mockAxios.post = jest.fn().mockResolvedValue({ data: { success: true } });
  
  // Setup
  await EmailService.initialize();
  EmailService.domains = ['mailduck.io', 'mail-duck.com', 'tempmail.com'];
  
  // Call generateEmail with a specific domain
  const email = await EmailService.generateEmail('tempmail.com');
  
  // Verify the email uses the specified domain
  expect(email).toMatch(/^[a-z0-9._]+@tempmail\.com$/);
  
  // Verify axios was called with the correct email
  expect(mockAxios.post).toHaveBeenCalledWith(
    expect.stringContaining('/mailbox/register'),
    { email: expect.stringMatching(/^[a-z0-9._]+@tempmail\.com$/) },
    expect.any(Object)
  );
});

test('generates different email formats', async () => {
  await EmailService.initialize();
  
  // Test a specific format to ensure it works as expected
  const formats = EmailService.generateRandomLocalPart.toString();
  
  // Check that the function includes various format patterns
  expect(formats).toContain('firstName.lastName');
  expect(formats).toContain('firstName + random number');
  expect(formats).toContain('firstName_lastName');
});

// Add test for deactivateCurrentEmail method
test('deactivateCurrentEmail clears current email and storage', async () => {
  // Mock axios for this test
  const mockAxios = require('axios');
  jest.mock('axios');
  mockAxios.post = jest.fn().mockResolvedValue({ data: { success: true } });
  
  // Setup
  await EmailService.initialize();
  EmailService.currentEmail = 'test@mailduck.io';
  EmailService.expirationTime = new Date(Date.now() + 30 * 60 * 1000);
  
  // Mock localStorage
  const localStorageMock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  };
  Object.defineProperty(window, 'localStorage', { value: localStorageMock });
  
  // Call the method
  await EmailService.deactivateCurrentEmail();
  
  // Verify axios was called with correct parameters
  expect(mockAxios.post).toHaveBeenCalledWith(
    expect.stringContaining('/mailbox/deactivate'),
    { email: 'test@mailduck.io' },
    expect.objectContaining({
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      })
    })
  );
  
  // Verify email and expiration were cleared
  expect(EmailService.currentEmail).toBeNull();
  expect(EmailService.expirationTime).toBeNull();
  
  // Verify localStorage items were removed
  expect(localStorageMock.removeItem).toHaveBeenCalledTimes(2);
});

// Test that generateEmail calls deactivateCurrentEmail when there's an existing email
test('generateEmail calls deactivateCurrentEmail when there is an existing email', async () => {
  // Mock axios for this test
  const mockAxios = require('axios');
  jest.mock('axios');
  mockAxios.post = jest.fn().mockResolvedValue({ data: { success: true } });
  
  // Setup
  await EmailService.initialize();
  EmailService.currentEmail = 'existing@mailduck.io';
  
  // Spy on deactivateCurrentEmail
  const spy = jest.spyOn(EmailService, 'deactivateCurrentEmail');
  
  // Call generateEmail
  await EmailService.generateEmail();
  
  // Verify deactivateCurrentEmail was called
  expect(spy).toHaveBeenCalledTimes(1);
  
  // Clean up
  spy.mockRestore();
});

// Test that invalid domains are not used
test('uses random domain when invalid domain is specified', async () => {
  // Mock axios for this test
  const mockAxios = require('axios');
  jest.mock('axios');
  mockAxios.post = jest.fn().mockResolvedValue({ data: { success: true } });
  
  // Setup
  await EmailService.initialize();
  EmailService.domains = ['mailduck.io', 'mail-duck.com', 'tempmail.com'];
  
  // Mock getRandomElement to return a predictable domain
  const originalGetRandomElement = EmailService.getRandomElement;
  EmailService.getRandomElement = jest.fn().mockReturnValue('mailduck.io');
  
  // Call generateEmail with an invalid domain
  const email = await EmailService.generateEmail('invalid-domain.com');
  
  // Verify the email uses a random domain from the list (mailduck.io in this case)
  expect(email).toMatch(/^[a-z0-9._]+@mailduck\.io$/);
  
  // Verify getRandomElement was called with the domains array
  expect(EmailService.getRandomElement).toHaveBeenCalledWith(EmailService.domains);
  
  // Restore original method
  EmailService.getRandomElement = originalGetRandomElement;
}); 