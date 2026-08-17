import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdBlockDonateMessage from './AdBlockDonateMessage';

describe('AdBlockDonateMessage', () => {
  test('renders adblock detection message', () => {
    render(
      <MemoryRouter>
        <AdBlockDonateMessage />
      </MemoryRouter>
    );

    expect(screen.getByText(/ad blocker detected/i)).toBeInTheDocument();
  });

  test('renders support message', () => {
    render(
      <MemoryRouter>
        <AdBlockDonateMessage />
      </MemoryRouter>
    );

    expect(screen.getByText(/ads fund the free inbox/i)).toBeInTheDocument();
  });

  test('renders Pro CTA instead of PayPal donate', () => {
    render(
      <MemoryRouter>
        <AdBlockDonateMessage />
      </MemoryRouter>
    );

    expect(screen.getByTestId('pro-cta-link')).toHaveAttribute('href', '/pro');
  });

  test('applies custom width and height', () => {
    const { container } = render(
      <MemoryRouter>
        <AdBlockDonateMessage width={728} height={90} />
      </MemoryRouter>
    );

    const messageContainer = container.querySelector('.adblock-donate-message');
    expect(messageContainer.style.width).toBe('728px');
    expect(messageContainer.style.height).toBe('90px');
  });

  test('applies default width and height', () => {
    const { container } = render(
      <MemoryRouter>
        <AdBlockDonateMessage />
      </MemoryRouter>
    );

    const messageContainer = container.querySelector('.adblock-donate-message');
    expect(messageContainer.style.width).toBe('300px');
    expect(messageContainer.style.height).toBe('250px');
  });

  test('applies custom className', () => {
    const { container } = render(
      <MemoryRouter>
        <AdBlockDonateMessage className="custom-class" />
      </MemoryRouter>
    );

    const messageContainer = container.querySelector('.adblock-donate-message');
    expect(messageContainer.classList.contains('custom-class')).toBe(true);
  });

  test('has correct test id', () => {
    render(
      <MemoryRouter>
        <AdBlockDonateMessage />
      </MemoryRouter>
    );

    expect(screen.getByTestId('adblock-donate-message')).toBeInTheDocument();
  });
});
