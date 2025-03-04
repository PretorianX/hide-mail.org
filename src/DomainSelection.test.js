import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import EmailService from './services/EmailService';

// Mock the EmailService
jest.mock('./services/EmailService', () => ({
  initialize: jest.fn().mockResolvedValue(undefined),
  getAvailableDomains: jest.fn().mockResolvedValue(['tempmail.com', 'duckmail.org', 'mailduck.io']),
  generateEmail: jest.fn().mockImplementation((domain) => {
    const localPart = 'testuser';
    const emailDomain = domain || 'tempmail.com';
    return Promise.resolve(`${localPart}@${emailDomain}`);
  }),
  currentEmail: null,
  domains: ['tempmail.com', 'duckmail.org', 'mailduck.io'],
  getMessages: jest.fn().mockResolvedValue([]),
  refreshExpirationTime: jest.fn().mockResolvedValue(true),
  deactivateCurrentEmail: jest.fn().mockResolvedValue(undefined),
}));

describe('Domain Selection Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('selecting a domain generates a new email with that domain', async () => {
    render(<App />);
    
    // Wait for the app to initialize
    await waitFor(() => {
      expect(EmailService.initialize).toHaveBeenCalled();
    });
    
    // Find the domain select dropdown
    const domainSelect = screen.getByLabelText(/Choose a domain/i);
    expect(domainSelect).toBeInTheDocument();
    
    // Select a specific domain
    fireEvent.change(domainSelect, { target: { value: 'duckmail.org' } });
    
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
    const domainSelect = screen.getByLabelText(/Choose a domain/i);
    
    // Clear any previous calls
    EmailService.generateEmail.mockClear();
    
    // Select the random domain option (empty value)
    fireEvent.change(domainSelect, { target: { value: '' } });
    
    // Verify that generateEmail was not called
    expect(EmailService.generateEmail).not.toHaveBeenCalled();
  });
}); 