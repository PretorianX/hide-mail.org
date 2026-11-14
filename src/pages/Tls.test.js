import React from 'react';
import { readFileSync } from 'fs';
import { MemoryRouter } from 'react-router';
import { render, screen, fireEvent } from '@testing-library/react';
import Tls from './Tls';
import TlsService from '../services/TlsService';

const tlsCss = readFileSync(require.resolve('./Tls.css'), 'utf8');

jest.mock('../services/TlsService', () => ({
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

const renderTls = () => render(
  <MemoryRouter>
    <Tls />
  </MemoryRouter>
);

const failureReport = {
  stored: false,
  stamp: 'FAILURES',
  verdict: 'failures',
  summary: '26 sessions failed TLS. mx1.northwind.example presented an expired certificate.',
  successfulSessions: 840,
  failedSessions: 26,
  policies: [
    {
      domain: 'northwind.example',
      policyType: 'sts',
      policyLabel: 'MTA-STS',
      mode: 'enforce',
      successfulSessions: 840,
      failedSessions: 26,
      failures: [
        {
          resultType: 'certificate-expired',
          reason: 'The certificate had expired.',
          receivingHost: 'mx1.northwind.example',
          sendingIp: '203.0.113.8',
          failedSessions: 26,
        },
      ],
    },
  ],
};

describe('TLS Reports page', () => {
  beforeEach(() => {
    TlsService.read.mockReset();
    TlsService.loadOffer.mockResolvedValue({
      name: 'TLS Reports API',
      type: 'tls',
      plan: 'monthly',
      usd: 24,
      checkoutPaused: true,
      endpoint: 'POST /api/tls-reports',
    });
    TlsService.getKey.mockReturnValue(null);
  });

  test('paints pasted reports in light ink on the dark field', () => {
    expect(tlsCss).toMatch(/body\[data-theme='dark'\] \.tls-page textarea[\s\S]*-webkit-text-fill-color: #e0e0e0/);
    expect(tlsCss).toMatch(/body\[data-theme='dark'\] \.tls-page textarea[\s\S]*color-scheme: dark/);
  });

  test('keeps a visible orange focus ring and wraps the slip on a narrow screen', () => {
    expect(tlsCss).toMatch(/\.tls-page textarea:focus-visible[\s\S]*outline: 3px solid var\(--duck-orange\)/);
    expect(tlsCss).toMatch(/@media \(max-width: 640px\)[\s\S]*\.tls-slip \{[\s\S]*flex-wrap: wrap/);
    expect(tlsCss).toMatch(/@media \(max-width: 640px\)[\s\S]*\.tls-form textarea \{[\s\S]*min-height: 120px/);
    expect(tlsCss).toMatch(/@media \(max-width: 640px\)[\s\S]*\.tls-submit,\s*\.tls-offer button \{[\s\S]*width: 100%/);
  });

  test('starts empty, with the stamp waiting and one primary action', async () => {
    renderTls();

    expect(screen.getByRole('heading', { name: 'TLS Reports' })).toBeInTheDocument();
    expect(screen.getByTestId('tls-stamp')).toHaveTextContent('—');
    expect(screen.getByTestId('tls-slip')).toHaveTextContent(/failure stamp shows up here/i);
    expect(screen.getByTestId('tls-empty')).toHaveTextContent(/nothing you paste is stored/i);
    expect(screen.getByRole('button', { name: 'Read this report' })).toBeEnabled();
    expect(screen.queryByTestId('tls-result')).not.toBeInTheDocument();
    expect(await screen.findByTestId('tls-price')).toHaveTextContent('$24 per month');
    expect(screen.getByRole('button', { name: 'Buy the TLS Reports API' })).toBeDisabled();
  });

  test('shows an error and does not read an empty paste', async () => {
    renderTls();

    fireEvent.click(screen.getByRole('button', { name: 'Read this report' }));

    expect(await screen.findByTestId('tls-error')).toHaveTextContent('Paste an SMTP TLS report first.');
    expect(TlsService.read).not.toHaveBeenCalled();
    expect(screen.queryByTestId('tls-result')).not.toBeInTheDocument();
    expect(screen.getByTestId('tls-stamp')).toHaveTextContent('—');
  });

  test('stamps the hosts that failed TLS', async () => {
    TlsService.read.mockResolvedValue(failureReport);
    renderTls();

    fireEvent.change(screen.getByLabelText('SMTP TLS report'), {
      target: { value: '{"organization-name":"Northwind Post"}' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Read this report' }));

    expect(await screen.findByTestId('tls-result')).toHaveTextContent('mx1.northwind.example');
    expect(screen.getByTestId('tls-stamp')).toHaveTextContent('FAILURES');
    expect(screen.getByTestId('tls-summary')).toHaveTextContent('expired certificate');
    expect(screen.getByTestId('tls-result')).toHaveTextContent('The certificate had expired.');
    expect(screen.queryByTestId('tls-empty')).not.toBeInTheDocument();
  });

  test('clears the stamp when the next paste is rejected', async () => {
    TlsService.read
      .mockResolvedValueOnce(failureReport)
      .mockRejectedValueOnce(new Error('That text is not an SMTP TLS report.'));
    renderTls();

    fireEvent.change(screen.getByLabelText('SMTP TLS report'), {
      target: { value: '{"policies":[]}' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Read this report' }));
    expect(await screen.findByTestId('tls-result')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('SMTP TLS report'), {
      target: { value: 'From: Ada <ada@example.com>' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Read this report' }));

    expect(await screen.findByTestId('tls-error')).toHaveTextContent(
      'That text is not an SMTP TLS report.'
    );
    expect(screen.queryByTestId('tls-result')).not.toBeInTheDocument();
    expect(screen.getByTestId('tls-stamp')).toHaveTextContent('—');
  });
});
