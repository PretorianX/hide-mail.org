import React from 'react';
import { readFileSync } from 'fs';
import { MemoryRouter } from 'react-router';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Bounces from './Bounces';
import BounceService from '../services/BounceService';

const bounceCss = readFileSync(require.resolve('./Bounces.css'), 'utf8');

jest.mock('../services/BounceService', () => ({
  read: jest.fn(),
  loadOffer: jest.fn(),
  getKey: jest.fn(),
  validate: jest.fn(),
  fetchHandoff: jest.fn(),
  requestApiKey: jest.fn(),
  clearKey: jest.fn(),
}));

jest.mock('../services/LicenseService', () => ({
  checkout: jest.fn(),
  submitWayforpayCheckout: jest.fn(),
}));

const renderBounces = () => render(
  <MemoryRouter>
    <Bounces />
  </MemoryRouter>
);

describe('Bounce Read page', () => {
  beforeEach(() => {
    BounceService.read.mockReset();
    BounceService.loadOffer.mockResolvedValue({
      name: 'Bounce Read API',
      type: 'bounce',
      plan: 'monthly',
      usd: 18,
      checkoutPaused: true,
      endpoint: 'POST /api/bounce-read',
    });
    BounceService.getKey.mockReturnValue(null);
  });

  test('paints pasted mail in light ink on the dark field', () => {
    expect(bounceCss).toMatch(/body\[data-theme='dark'\] \.bounce-page textarea[\s\S]*-webkit-text-fill-color: #e0e0e0/);
    expect(bounceCss).toMatch(/body\[data-theme='dark'\] \.bounce-page textarea[\s\S]*color-scheme: dark/);
  });

  test('keeps a visible focus ring and wraps the action onto a narrow screen', () => {
    expect(bounceCss).toMatch(/\.bounce-page button:focus-visible[\s\S]*outline: 3px solid var\(--duck-orange\)/);
    expect(bounceCss).toMatch(/@media \(max-width: 640px\)[\s\S]*\.bounce-work \{[\s\S]*flex-wrap: nowrap/);
    expect(bounceCss).toMatch(/@media \(max-width: 640px\)[\s\S]*\.bounce-submit[\s\S]*width: 100%/);
    expect(bounceCss).toMatch(/\.bounce-recipient \{[\s\S]*flex-wrap: wrap/);
  });

  test('starts empty, with the stamp waiting and one primary action', async () => {
    renderBounces();

    expect(screen.getByRole('heading', { name: 'Bounce Read' })).toBeInTheDocument();
    expect(screen.getByTestId('bounce-stamp')).toHaveTextContent('—');
    expect(screen.getByTestId('bounce-empty')).toHaveTextContent(/nothing you paste is stored/i);
    expect(screen.getByRole('button', { name: 'Read this bounce' })).toBeEnabled();
    expect(await screen.findByTestId('bounce-price')).toHaveTextContent('$18 per month');
    expect(screen.getByRole('button', { name: 'Buy the Bounce Read API' })).toBeDisabled();
  });

  test('shows an error and does not read an empty paste', async () => {
    renderBounces();

    fireEvent.click(screen.getByRole('button', { name: 'Read this bounce' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Paste a bounce first.');
    expect(BounceService.read).not.toHaveBeenCalled();
    expect(screen.queryByTestId('bounce-result')).not.toBeInTheDocument();
    expect(screen.getByTestId('bounce-stamp')).toHaveTextContent('—');
  });

  test('shows the server error and clears any previous report', async () => {
    BounceService.read.mockRejectedValue(new Error('That text is not a delivery status notification.'));
    renderBounces();

    fireEvent.change(screen.getByLabelText('Raw bounce'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Read this bounce' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/not a delivery status notification/i);
    expect(screen.queryByTestId('bounce-result')).not.toBeInTheDocument();
    expect(screen.getByTestId('bounce-stamp')).toHaveTextContent('—');
  });

  test('stamps a hard failure and lists the recipient', async () => {
    BounceService.read.mockResolvedValue({
      stored: false,
      verdict: 'hard',
      summary: 'Hard failure. Do not retry ada@example.com.',
      reportingMta: 'dns; mx.example.com',
      recipients: [
        {
          recipient: 'ada@example.com',
          action: 'failed',
          status: '5.1.1',
          class: 'hard',
          retry: false,
          title: 'No such mailbox',
          detail: 'The destination mailbox does not exist. Do not retry it.',
          diagnostic: 'smtp; 550 5.1.1 user unknown',
          remoteMta: 'dns; mx.example.net',
        },
      ],
    });
    renderBounces();

    fireEvent.change(screen.getByLabelText('Raw bounce'), {
      target: { value: 'Status: 5.1.1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Read this bounce' }));

    expect(await screen.findByTestId('bounce-result')).toHaveTextContent(
      'Hard failure. Do not retry ada@example.com.'
    );
    expect(screen.getByTestId('bounce-stamp')).toHaveTextContent('HARD');
    expect(screen.getByTestId('bounce-stamp')).toHaveClass('bounce-stamp-hard');
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByText('No such mailbox')).toBeInTheDocument();
    expect(screen.getByText('Do not retry this address.')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByTestId('bounce-empty')).not.toBeInTheDocument();
    });
  });
});
