import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import MailboxTimer from './MailboxTimer.js';
import EmailService from '../services/EmailService.js';

// Mock the EmailService
jest.mock('../services/EmailService.js', () => ({
  getExpirationTime: jest.fn(),
  getRemainingTime: jest.fn(),
  refreshExpirationTime: jest.fn()
}));

describe('MailboxTimer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Set default mock implementation for getRemainingTime
    EmailService.getRemainingTime.mockReturnValue(15 * 60 * 1000);
  });

  test('renders timer with correct format', () => {
    // Mock 15 minutes remaining (in milliseconds)
    EmailService.getRemainingTime.mockReturnValue(15 * 60 * 1000);
    
    render(<MailboxTimer email="test@example.com" />);
    
    expect(screen.getByText('Mailbox expires in:')).toBeInTheDocument();
    expect(screen.getByText('15:00')).toBeInTheDocument();
    expect(screen.getByText('Refresh Timer')).toBeInTheDocument();
  });

  test('shows expired when time is up', () => {
    EmailService.getRemainingTime.mockReturnValue(0);
    
    render(<MailboxTimer email="test@example.com" />);
    
    expect(screen.getByText('Expired')).toBeInTheDocument();
  });

  test('calls onExpired when time reaches zero', () => {
    // Start with some time
    EmailService.getRemainingTime.mockReturnValueOnce(1000);
    // Then return 0 on next call
    EmailService.getRemainingTime.mockReturnValueOnce(0);
    
    const mockOnExpired = jest.fn();
    
    jest.useFakeTimers();
    
    render(<MailboxTimer email="test@example.com" onExpire={mockOnExpired} />);
    
    // Fast-forward time
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    
    expect(mockOnExpired).toHaveBeenCalled();
    
    jest.useRealTimers();
  });

  test('refreshes timer when button is clicked', () => {
    EmailService.getRemainingTime.mockReturnValue(10 * 60 * 1000);
    EmailService.refreshExpirationTime.mockReturnValue(true);
    
    const mockOnExtend = jest.fn();
    
    render(<MailboxTimer email="test@example.com" onExtend={mockOnExtend} />);
    
    fireEvent.click(screen.getByText('Refresh Timer'));
    
    expect(EmailService.refreshExpirationTime).toHaveBeenCalled();
    expect(mockOnExtend).toHaveBeenCalled();
  });
}); 