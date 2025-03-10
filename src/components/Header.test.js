import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Header from './Header.js';
import EmailService from '../services/EmailService.js';

// Mock the EmailService
jest.mock('../services/EmailService.js', () => ({
  getAvailableDomains: jest.fn().mockResolvedValue(['tempmail.com', 'duckmail.org', 'mailduck.io']),
}));

describe('Header Component', () => {
  const mockOnGenerateEmail = jest.fn();
  const mockOnRefreshMessages = jest.fn().mockResolvedValue(undefined);
  const mockOnMailboxExpired = jest.fn();
  
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  test('should call onGenerateEmail with selected domain when Generate New Email button is clicked', async () => {
    // Render the Header component with a mock email
    render(
      <Header 
        email="test@tempmail.com"
        onGenerateEmail={mockOnGenerateEmail}
        onRefreshMessages={mockOnRefreshMessages}
        onMailboxExpired={mockOnMailboxExpired}
      />
    );
    
    // Wait for domains to load
    await waitFor(() => {
      expect(EmailService.getAvailableDomains).toHaveBeenCalled();
    });
    
    // Open the domain dropdown
    const dropdownToggle = screen.getByText('▼');
    fireEvent.click(dropdownToggle);
    
    // Select a domain
    const domainOption = screen.getByText('@duckmail.org');
    fireEvent.click(domainOption);
    
    // Verify that onGenerateEmail was called with the selected domain
    expect(mockOnGenerateEmail).toHaveBeenCalledWith('duckmail.org');
    
    // Reset the mock
    mockOnGenerateEmail.mockClear();
    
    // Click the Generate New Email button
    const generateButton = screen.getByText('Generate New Email');
    fireEvent.click(generateButton);
    
    // Verify that onGenerateEmail was called with the selected domain
    expect(mockOnGenerateEmail).toHaveBeenCalledWith('duckmail.org');
  });
  
  test('should call onGenerateEmail with null when no domain is selected', async () => {
    // Render the Header component with a mock email
    render(
      <Header 
        email="test@tempmail.com"
        onGenerateEmail={mockOnGenerateEmail}
        onRefreshMessages={mockOnRefreshMessages}
        onMailboxExpired={mockOnMailboxExpired}
      />
    );
    
    // Wait for domains to load
    await waitFor(() => {
      expect(EmailService.getAvailableDomains).toHaveBeenCalled();
    });
    
    // Click the Generate New Email button without selecting a domain
    const generateButton = screen.getByText('Generate New Email');
    fireEvent.click(generateButton);
    
    // Verify that onGenerateEmail was called with null
    expect(mockOnGenerateEmail).toHaveBeenCalledWith(null);
  });
}); 