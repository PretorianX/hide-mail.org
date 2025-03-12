import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import EmailGenerator from './EmailGenerator';
import EmailService from '../services/EmailService';
import { getConfig } from '../utils/configLoader';

// Mock dependencies
jest.mock('../services/EmailService');
jest.mock('../utils/configLoader');

describe('EmailGenerator Component', () => {
  beforeEach(() => {
    // Setup mocks
    EmailService.generateEmail.mockResolvedValue('test@hide-mail.org');
    getConfig.mockImplementation((key) => {
      if (key === 'email.domains') return ['hide-mail.org', 'private-mail.org'];
      if (key === 'email.expirationTime') return 1800;
      if (key === 'email.extensionTime') return 900;
      return null;
    });
    
    // Clear localStorage before each test
    localStorage.clear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('renders domain selector and generates email on mount', async () => {
    render(<EmailGenerator />);
    
    // Check if domain selector is rendered
    expect(screen.getByLabelText(/Select Domain/i)).toBeInTheDocument();
    
    // Wait for email to be generated
    await waitFor(() => {
      expect(EmailService.generateEmail).toHaveBeenCalledTimes(1);
    });
  });

  test('displays email and expiration timer after generation', async () => {
    render(<EmailGenerator />);
    
    // Wait for email to be displayed
    await waitFor(() => {
      expect(screen.getByText('test@hide-mail.org')).toBeInTheDocument();
    });
    
    // Check if timer is displayed
    expect(screen.getByText(/Expires in:/i)).toBeInTheDocument();
  });

  test('allows copying email to clipboard', async () => {
    // Mock clipboard API
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    });
    
    render(<EmailGenerator />);
    
    // Wait for email to be displayed
    await waitFor(() => {
      expect(screen.getByText('test@hide-mail.org')).toBeInTheDocument();
    });
    
    // Click copy button
    fireEvent.click(screen.getByText(/Copy/i));
    
    // Check if clipboard API was called with correct email
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test@hide-mail.org');
  });

  test('changes domain when selector is changed', async () => {
    render(<EmailGenerator />);
    
    // Wait for initial email generation
    await waitFor(() => {
      expect(EmailService.generateEmail).toHaveBeenCalledTimes(1);
    });
    
    // Change domain
    fireEvent.change(screen.getByLabelText(/Select Domain/i), { 
      target: { value: 'private-mail.org' } 
    });
    
    // Check if email is regenerated with new domain
    await waitFor(() => {
      expect(EmailService.generateEmail).toHaveBeenCalledTimes(2);
      expect(EmailService.generateEmail).toHaveBeenLastCalledWith('private-mail.org');
    });
  });

  test('does not render Extend or View Inbox buttons', async () => {
    render(<EmailGenerator />);
    
    // Wait for email to be displayed
    await waitFor(() => {
      expect(screen.getByText('test@hide-mail.org')).toBeInTheDocument();
    });
    
    // Verify that Extend and View Inbox buttons are not present
    expect(screen.queryByText(/Extend/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/View Inbox/i)).not.toBeInTheDocument();
  });
}); 