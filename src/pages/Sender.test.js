import React from 'react';
import { readFileSync } from 'fs';
import { MemoryRouter } from 'react-router';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Sender from './Sender';
import SenderService from '../services/SenderService';

const senderCss = readFileSync(require.resolve('./Sender.css'), 'utf8');

jest.mock('../services/SenderService', () => ({
  check: jest.fn(),
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

const renderSender = () => render(
  <MemoryRouter>
    <Sender />
  </MemoryRouter>
);

const readyReport = {
  domain: 'example.com',
  verdict: 'Ready',
  summary: 'Receivers can enforce a sender policy for example.com.',
  stored: false,
  records: [
    { id: 'mx', name: 'MX', status: 'pass', detail: 'Mail hosts are published: mx.example.com.', record: 'mx.example.com' },
    { id: 'spf', name: 'SPF', status: 'pass', detail: 'SPF names the servers that may send and rejects the rest.', record: 'v=spf1 -all' },
    { id: 'dmarc', name: 'DMARC', status: 'pass', detail: 'DMARC asks receivers to reject mail that fails alignment.', record: 'v=DMARC1; p=reject' },
  ],
};

describe('Sender Check page', () => {
  beforeEach(() => {
    SenderService.check.mockReset();
    SenderService.loadOffer.mockResolvedValue({
      name: 'Sender Check API',
      type: 'sender',
      plan: 'monthly',
      usd: 12,
      checkoutPaused: true,
      endpoint: 'POST /api/sender-check',
    });
    SenderService.getKey.mockReturnValue(null);
  });

  test('styles the policy card for dark theme, focus, and a wrapping small screen', () => {
    expect(senderCss).toMatch(/body\[data-theme='dark'\] \.sender-page input[\s\S]*-webkit-text-fill-color: #e0e0e0/);
    expect(senderCss).toMatch(/body\[data-theme='dark'\] \.sender-page input[\s\S]*color-scheme: dark/);
    expect(senderCss).toMatch(/\.sender-page input:focus-visible/);
    expect(senderCss).toMatch(/@media \(max-width: 640px\)[\s\S]*\.sender-work \{[\s\S]*flex-wrap: wrap/);
  });

  test('starts empty, with the policy card and a free API price', async () => {
    renderSender();

    expect(screen.getByRole('heading', { name: 'Sender Check' })).toBeInTheDocument();
    expect(screen.getByTestId('sender-policy-card')).toBeInTheDocument();
    expect(screen.getByTestId('sender-verdict')).toHaveTextContent('—');
    expect(screen.getByTestId('sender-slot-mx')).toHaveTextContent('—');
    expect(screen.getByTestId('sender-empty')).toHaveTextContent(/nothing you type is stored/i);
    expect(screen.getByRole('button', { name: 'Check this domain' })).toBeInTheDocument();
    expect(await screen.findByTestId('sender-price')).toHaveTextContent('$12 per month');
    expect(screen.getByRole('button', { name: 'Buy the Sender Check API' })).toBeDisabled();
  });

  test('shows an error and does not check an empty domain', async () => {
    renderSender();

    fireEvent.click(screen.getByRole('button', { name: 'Check this domain' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a domain name.');
    expect(SenderService.check).not.toHaveBeenCalled();
    expect(screen.queryByTestId('sender-result')).not.toBeInTheDocument();
    expect(screen.getByTestId('sender-verdict')).toHaveTextContent('—');
  });

  test('fills the policy card when the check succeeds', async () => {
    SenderService.check.mockResolvedValue(readyReport);
    renderSender();

    fireEvent.change(screen.getByLabelText('Domain'), { target: { value: 'example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check this domain' }));

    expect(await screen.findByTestId('sender-result')).toHaveTextContent('Ready');
    expect(screen.getByTestId('sender-verdict')).toHaveTextContent('Ready');
    expect(screen.getByTestId('sender-slot-spf')).toHaveTextContent('rejects the rest');
    expect(screen.getByTestId('sender-result')).toHaveTextContent('v=spf1 -all');
    await waitFor(() => {
      expect(SenderService.check).toHaveBeenCalledWith('example.com');
    });
  });

  test('shows the lookup error and clears a previous report', async () => {
    SenderService.check.mockResolvedValueOnce(readyReport);
    renderSender();

    fireEvent.change(screen.getByLabelText('Domain'), { target: { value: 'example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check this domain' }));
    expect(await screen.findByTestId('sender-result')).toHaveTextContent('Ready');

    SenderService.check.mockRejectedValue(new Error('The DNS lookup did not answer. Try again.'));
    fireEvent.change(screen.getByLabelText('Domain'), { target: { value: 'down.example' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check this domain' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The DNS lookup did not answer. Try again.');
    expect(screen.getByTestId('sender-verdict')).toHaveTextContent('—');
    expect(screen.queryByTestId('sender-result')).not.toBeInTheDocument();
  });
});
