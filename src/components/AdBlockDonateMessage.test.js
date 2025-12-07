import React from 'react';
import { render, screen } from '@testing-library/react';
import AdBlockDonateMessage from './AdBlockDonateMessage';

// Mock the DonateButton component
jest.mock('./DonateButton', () => {
  return function MockDonateButton({ className }) {
    return <div data-testid="donate-button-mock" className={className}>Donate Button</div>;
  };
});

describe('AdBlockDonateMessage', () => {
  test('renders adblock detection message', () => {
    render(<AdBlockDonateMessage />);
    
    expect(screen.getByText(/ad blocker detected/i)).toBeInTheDocument();
  });

  test('renders support message', () => {
    render(<AdBlockDonateMessage />);
    
    expect(screen.getByText(/please support us/i)).toBeInTheDocument();
  });

  test('renders donate button', () => {
    render(<AdBlockDonateMessage />);
    
    expect(screen.getByTestId('donate-button-mock')).toBeInTheDocument();
  });

  test('applies custom width and height', () => {
    const { container } = render(<AdBlockDonateMessage width={728} height={90} />);
    
    const messageContainer = container.querySelector('.adblock-donate-message');
    expect(messageContainer.style.width).toBe('728px');
    expect(messageContainer.style.height).toBe('90px');
  });

  test('applies default width and height', () => {
    const { container } = render(<AdBlockDonateMessage />);
    
    const messageContainer = container.querySelector('.adblock-donate-message');
    expect(messageContainer.style.width).toBe('300px');
    expect(messageContainer.style.height).toBe('250px');
  });

  test('applies custom className', () => {
    const { container } = render(<AdBlockDonateMessage className="custom-class" />);
    
    const messageContainer = container.querySelector('.adblock-donate-message');
    expect(messageContainer.classList.contains('custom-class')).toBe(true);
  });

  test('has correct test id', () => {
    render(<AdBlockDonateMessage />);
    
    expect(screen.getByTestId('adblock-donate-message')).toBeInTheDocument();
  });
});
