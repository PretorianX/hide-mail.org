import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MailboxTimer from './MailboxTimer.js';
import EmailService from '../services/EmailService.js';

const renderTimer = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

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
    
    renderTimer(<MailboxTimer email="test@example.com" />);
    
    expect(screen.getByText('Mailbox expires in:')).toBeInTheDocument();
    expect(screen.getByText('15:00')).toBeInTheDocument();
    expect(screen.getByText('Add 15 minutes')).toBeInTheDocument();
  });

  test('shows expired when time is up', () => {
    EmailService.getRemainingTime.mockReturnValue(0);
    
    renderTimer(<MailboxTimer email="test@example.com" />);
    
    expect(screen.getByText('Expired')).toBeInTheDocument();
  });

  test('calls onExpired when time reaches zero', () => {
    // Start with some time
    EmailService.getRemainingTime.mockReturnValueOnce(1000);
    // Then return 0 on next call
    EmailService.getRemainingTime.mockReturnValueOnce(0);
    
    const mockOnExpired = jest.fn();
    
    jest.useFakeTimers();
    
    renderTimer(<MailboxTimer email="test@example.com" onExpire={mockOnExpired} />);
    
    // Fast-forward time
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    
    expect(mockOnExpired).toHaveBeenCalled();
    
    jest.useRealTimers();
  });

  test('upsells Pro when the mailbox is close to expiry', () => {
    EmailService.getRemainingTime.mockReturnValue(5 * 60 * 1000);

    renderTimer(<MailboxTimer email="test@example.com" />);

    expect(screen.getByTestId('pro-cta-link')).toBeInTheDocument();
  });

  test('extends the mailbox when the button is clicked', async () => {
    EmailService.getRemainingTime.mockReturnValue(10 * 60 * 1000);
    EmailService.refreshExpirationTime.mockResolvedValue(true);

    const mockOnExtend = jest.fn();

    renderTimer(<MailboxTimer email="test@example.com" onExtend={mockOnExtend} />);

    fireEvent.click(screen.getByText('Add 15 minutes'));

    expect(EmailService.refreshExpirationTime).toHaveBeenCalled();
    await waitFor(() => expect(mockOnExtend).toHaveBeenCalled());
  });

  test('warns instead of pretending when the server refuses to extend', async () => {
    EmailService.getRemainingTime.mockReturnValue(10 * 60 * 1000);
    EmailService.refreshExpirationTime.mockResolvedValue(false);

    const mockOnExtend = jest.fn();

    renderTimer(<MailboxTimer email="test@example.com" onExtend={mockOnExtend} />);

    fireEvent.click(screen.getByText('Add 15 minutes'));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not extend/i);
    expect(mockOnExtend).not.toHaveBeenCalled();
  });
}); 