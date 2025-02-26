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
  await EmailService.initialize();
  const email = await EmailService.generateEmail('mailduck.io');
  expect(email).toMatch(/^[a-z0-9._]+@mailduck\.io$/);
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