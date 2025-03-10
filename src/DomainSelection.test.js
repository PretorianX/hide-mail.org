import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App.js';
import EmailService from './services/EmailService.js';

// Mock the EmailService
jest.mock('./services/EmailService.js');

describe('Domain Selection Tests', () => {
  const mockDomains = ['tempmail.com', 'duckmail.org', 'mailduck.io'];
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup EmailService mock implementation
    EmailService.domains = mockDomains;
    EmailService.initialize = jest.fn().mockResolvedValue(undefined);
    EmailService.getAvailableDomains = jest.fn().mockResolvedValue(mockDomains);
    EmailService.generateEmail = jest.fn().mockImplementation((domain) => {
      const localPart = 'testuser';
      const emailDomain = domain || 'tempmail.com';
      return Promise.resolve(`${localPart}@${emailDomain}`);
    });
    EmailService.currentEmail = null;
    EmailService.getMessages = jest.fn().mockResolvedValue([]);
    EmailService.refreshExpirationTime = jest.fn().mockResolvedValue(true);
    EmailService.deactivateCurrentEmail = jest.fn().mockResolvedValue(undefined);
    EmailService.getExpirationTime = jest.fn().mockReturnValue(new Date(Date.now() + 30 * 60 * 1000));
    EmailService.getRemainingTime = jest.fn().mockReturnValue(30 * 60 * 1000);
  });

  test('selecting a domain generates a new email with that domain', async () => {
    render(<App />);
    
    // Wait for the app to initialize and domains to be loaded
    await waitFor(() => {
      expect(EmailService.initialize).toHaveBeenCalled();
    });
    
    // Find the domain select dropdown
    const domainSelect = await screen.findByTestId('domain-select');
    
    // Select a specific domain
    fireEvent.change(domainSelect, { target: { value: 'duckmail.org' } });
    
    // Find and click the Generate New Email button
    const generateButton = await screen.findByText('Generate New Email');
    fireEvent.click(generateButton);
    
    // Verify that generateEmail was called with the selected domain
    await waitFor(() => {
      expect(EmailService.generateEmail).toHaveBeenCalledWith('duckmail.org');
    });
  });

  test('selecting random domain option does not trigger email generation', async () => {
    render(<App />);
    
    // Wait for the app to initialize
    await waitFor(() => {
      expect(EmailService.initialize).toHaveBeenCalled();
    });
    
    // Find the domain select dropdown
    const domainSelect = await screen.findByTestId('domain-select');
    
    // Clear any previous calls
    EmailService.generateEmail.mockClear();
    
    // Select the random domain option (empty value)
    fireEvent.change(domainSelect, { target: { value: '' } });
    
    // Verify that generateEmail was not called
    expect(EmailService.generateEmail).not.toHaveBeenCalled();
  });
}); 