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

  test('loads a sample domain and renders MX provider, SPF lookup count, DMARC tags, and recommendations', async () => {
    SenderService.check.mockResolvedValue({
      ...readyReport,
      records: [
        {
          ...readyReport.records[0],
          parsed: {
            provider: 'Google Workspace',
            exchangeCount: 1,
            nullMx: false,
            exchanges: [{ priority: 10, exchange: 'aspmx.l.google.com' }],
          },
        },
        {
          ...readyReport.records[1],
          parsed: {
            dnsLookupCount: 2,
            dnsLookupLimit: 10,
            exceedsLookupLimit: false,
            allQualifier: '-all',
            mechanisms: [
              {
                token: 'include:_spf.google.com',
                causesDnsLookup: true,
                description: 'Includes policy from _spf.google.com',
              },
            ],
          },
        },
        {
          ...readyReport.records[2],
          parsed: {
            tags: [
              {
                tag: 'p',
                value: 'reject',
                label: 'Domain policy',
                explanation: 'Receivers reject messages that fail DMARC alignment.',
              },
            ],
          },
        },
      ],
      recommendations: [
        {
          id: 'dmarc_rua',
          severity: 'low',
          title: 'Add aggregate reporting (rua)',
          detail: 'Add rua=mailto:dmarc@example.com to receive daily XML reports.',
          suggestedRecord: 'v=DMARC1; p=reject; rua=mailto:dmarc@example.com',
        },
      ],
    });
    renderSender();

    fireEvent.click(screen.getByRole('button', { name: 'Load sample' }));
    expect(screen.getByLabelText('Domain').value).toBe('example.com');

    fireEvent.click(screen.getByRole('button', { name: 'Check this domain' }));

    expect(await screen.findByTestId('sender-mx-details')).toHaveTextContent('Google Workspace');
    expect(screen.getByTestId('sender-spf-details')).toHaveTextContent('2 / 10 RFC 7208 limit');
    expect(screen.getByTestId('sender-dmarc-details')).toHaveTextContent('Domain policy');
    expect(screen.getByTestId('sender-recommendations')).toHaveTextContent('Add aggregate reporting (rua)');
  });

  test('passes optional DKIM selector and renders DKIM Key Inspector, Recursive SPF Tree, and Transport Security & Brand cards', async () => {
    SenderService.check.mockResolvedValue({
      ...readyReport,
      records: [
        readyReport.records[0],
        {
          ...readyReport.records[1],
          parsed: {
            dnsLookupCount: 2,
            totalDnsLookups: 4,
            dnsLookupLimit: 10,
            overLookupLimit: false,
            allQualifier: '-all',
            mechanisms: [
              {
                token: 'include:_spf.google.com',
                lookups: 1,
                description: 'Includes policy from _spf.google.com',
              },
            ],
            includeTree: [
              {
                domain: '_spf.google.com',
                record: 'v=spf1 include:_netblocks.google.com ~all',
                lookups: 1,
                depth: 1,
              },
              {
                domain: '_netblocks.google.com',
                record: 'v=spf1 ip4:35.190.247.0/24 ~all',
                lookups: 0,
                depth: 2,
              },
            ],
          },
        },
        readyReport.records[2],
      ],
      dkim: {
        mode: 'explicit',
        probedSelectors: ['google'],
        selectors: [
          {
            selector: 'google',
            fqdn: 'google._domainkey.example.com',
            status: 'pass',
            keyType: 'rsa',
            keyBits: 2048,
            revoked: false,
            strictMode: false,
            testing: false,
            detail: 'RSA ~2048-bit public key published for selector google.',
            record: 'v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A...',
          },
        ],
      },
      transportAndBrand: {
        bimi: {
          id: 'bimi',
          name: 'BIMI',
          status: 'pass',
          detail: 'BIMI brand logo published with VMC certificate.',
          record: 'v=BIMI1; l=https://example.com/logo.svg; a=https://example.com/vmc.pem',
          parsed: {
            version: 'BIMI1',
            logoUrl: 'https://example.com/logo.svg',
            authorityUrl: 'https://example.com/vmc.pem',
          },
        },
        mtaSts: {
          id: 'mta_sts',
          name: 'MTA-STS',
          status: 'pass',
          detail: 'MTA-STS TXT policy published (id=20260101).',
          record: 'v=STSv1; id=20260101',
          parsed: {
            version: 'STSv1',
            policyId: '20260101',
          },
        },
        tlsRpt: {
          id: 'tls_rpt',
          name: 'TLS-RPT',
          status: 'pass',
          detail: 'SMTP TLS Reporting enabled (mailto:tlsrpt@example.com).',
          record: 'v=TLSRPTv1; rua=mailto:tlsrpt@example.com',
          parsed: {
            version: 'TLSRPTv1',
            rua: ['mailto:tlsrpt@example.com'],
          },
        },
      },
    });

    renderSender();

    fireEvent.change(screen.getByLabelText('Domain'), { target: { value: 'example.com' } });
    fireEvent.change(screen.getByLabelText('DKIM selector'), { target: { value: 'google' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check this domain' }));

    await waitFor(() => {
      expect(SenderService.check).toHaveBeenCalledWith('example.com', 'google');
    });

    expect(await screen.findByTestId('sender-dkim-details')).toHaveTextContent('google._domainkey.example.com');
    expect(screen.getByTestId('sender-dkim-details')).toHaveTextContent('2048-bit');
    expect(screen.getByTestId('sender-spf-tree')).toHaveTextContent('_spf.google.com');
    expect(screen.getByTestId('sender-spf-tree')).toHaveTextContent('_netblocks.google.com');
    expect(screen.getByTestId('sender-transport-brand')).toHaveTextContent('BIMI');
    expect(screen.getByTestId('sender-transport-brand')).toHaveTextContent('MTA-STS');
    expect(screen.getByTestId('sender-transport-brand')).toHaveTextContent('TLS-RPT');
  });
});
