import EmailService from './EmailService.js';
import axios from 'axios';

// Mock axios
jest.mock('axios');

describe('EmailService', () => {
  const mockDomains = ['tempmail.com', 'duckmail.org', 'mailduck.io'];
  
  beforeEach(() => {
    // Reset the EmailService state
    EmailService.domains = [...mockDomains];
    EmailService.currentEmail = null;
    EmailService.expirationTime = null;
    
    // Mock axios responses
    axios.post.mockResolvedValue({ data: { success: true } });
    axios.get.mockResolvedValue({ data: { domains: mockDomains } });
    
    // Mock localStorage
    global.localStorage = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn()
    };
    
    // Mock Date.now
    jest.spyOn(Date, 'now').mockImplementation(() => 1625097600000); // Fixed timestamp
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('generateEmail', () => {
    test('should generate email with specified domain when valid domain is provided', async () => {
      // Mock the random local part generation to return a fixed value
      jest.spyOn(EmailService, 'generateRandomLocalPart').mockReturnValue('testuser');
      
      // Call generateEmail with a specific domain
      const email = await EmailService.generateEmail('duckmail.org');
      
      // Verify the email has the correct domain
      expect(email).toBe('testuser@duckmail.org');
      
      // Verify the API call was made with the correct email
      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        { email: 'testuser@duckmail.org' },
        expect.any(Object)
      );
    });
    
    test('should generate email with random domain when no domain is provided', async () => {
      // Mock the random local part generation to return a fixed value
      jest.spyOn(EmailService, 'generateRandomLocalPart').mockReturnValue('testuser');
      
      // Mock the random domain selection to return a fixed value
      jest.spyOn(EmailService, 'getRandomElement').mockReturnValue('tempmail.com');
      
      // Call generateEmail without a domain
      const email = await EmailService.generateEmail();
      
      // Verify the email has the random domain
      expect(email).toBe('testuser@tempmail.com');
      
      // Verify the getRandomElement was called with the domains array
      expect(EmailService.getRandomElement).toHaveBeenCalledWith(mockDomains);
    });
    
    test('should generate email with random domain when invalid domain is provided', async () => {
      // Mock the random local part generation to return a fixed value
      jest.spyOn(EmailService, 'generateRandomLocalPart').mockReturnValue('testuser');
      
      // Mock the random domain selection to return a fixed value
      jest.spyOn(EmailService, 'getRandomElement').mockReturnValue('tempmail.com');
      
      // Call generateEmail with an invalid domain
      const email = await EmailService.generateEmail('invalid-domain.com');
      
      // Verify the email has the random domain
      expect(email).toBe('testuser@tempmail.com');
      
      // Verify the getRandomElement was called with the domains array
      expect(EmailService.getRandomElement).toHaveBeenCalledWith(mockDomains);
    });
    
    test('should deactivate current email before generating a new one', async () => {
      // Set up a current email
      EmailService.currentEmail = 'existing@tempmail.com';
      
      // Spy on deactivateCurrentEmail
      jest.spyOn(EmailService, 'deactivateCurrentEmail').mockResolvedValue(undefined);
      
      // Mock the random local part generation to return a fixed value
      jest.spyOn(EmailService, 'generateRandomLocalPart').mockReturnValue('testuser');
      
      // Call generateEmail
      await EmailService.generateEmail('duckmail.org');
      
      // Verify deactivateCurrentEmail was called
      expect(EmailService.deactivateCurrentEmail).toHaveBeenCalled();
    });
  });
}); 