import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import EmailGenerator from './EmailGenerator';
import EmailService from '../services/EmailService';
import { getConfig } from '../utils/configLoader';

// Mock dependencies
jest.mock('../services/EmailService');
jest.mock('../utils/configLoader', () => ({
  getConfig: jest.fn()
}));

describe('EmailGenerator Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock getConfig to return test values
    getConfig.mockImplementation((key) => {
      if (key === 'email.domains') {
        return ['hide-mail.org', 'private-mail.org'];
      } else if (key === 'email.expirationTime') {
        return 30 * 60; // 30 minutes in seconds
      } else if (key === 'email.extensionTime') {
        return 15 * 60; // 15 minutes in seconds
      }
      return null;
    });
    
    // Mock EmailService methods
    EmailService.generateEmail = jest.fn().mockImplementation((domain) => {
      return Promise.resolve(`test@${domain || 'hide-mail.org'}`);
    });
  });

  test('renders with domain selector', () => {
    render(<EmailGenerator />);
    
    expect(screen.getByLabelText(/Select Domain/i)).toBeInTheDocument();
    expect(screen.getByText('Generate Email')).toBeInTheDocument();
  });

  test('calls onGenerate prop when Generate Email button is clicked', async () => {
    const mockOnGenerate = jest.fn();
    render(<EmailGenerator onGenerate={mockOnGenerate} />);
    
    // Click the generate button
    fireEvent.click(screen.getByText('Generate Email'));
    
    // Check if onGenerate was called with the default domain
    expect(mockOnGenerate).toHaveBeenCalledWith('hide-mail.org');
  });

  test('calls onGenerate with selected domain when domain is changed', async () => {
    const mockOnGenerate = jest.fn();
    render(<EmailGenerator onGenerate={mockOnGenerate} />);
    
    // Change domain
    fireEvent.change(screen.getByLabelText(/Select Domain/i), { 
      target: { value: 'private-mail.org' } 
    });
    
    // Click the generate button
    fireEvent.click(screen.getByText('Generate Email'));
    
    // Check if onGenerate was called with the selected domain
    expect(mockOnGenerate).toHaveBeenCalledWith('private-mail.org');
  });

  test('uses EmailService directly when no onGenerate prop is provided', async () => {
    render(<EmailGenerator />);
    
    // Click the generate button
    fireEvent.click(screen.getByText('Generate Email'));
    
    // Check if EmailService.generateEmail was called
    await waitFor(() => {
      expect(EmailService.generateEmail).toHaveBeenCalledWith('hide-mail.org');
    });
  });
}); 