import React from 'react';
import { readFileSync } from 'fs';
import { MemoryRouter } from 'react-router';
import { render, screen, fireEvent } from '@testing-library/react';
import Reports from './Reports';
import ReportsService from '../services/ReportsService';

const reportsCss = readFileSync(require.resolve('./Reports.css'), 'utf8');

jest.mock('../services/ReportsService', () => ({
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

const renderReports = () => render(
  <MemoryRouter>
    <Reports />
  </MemoryRouter>
);

const mixedReport = {
  stored: false,
  verdict: 'Mixed',
  domain: 'example.com',
  orgName: 'google.com',
  policy: 'quarantine',
  begin: '2017-12-04',
  end: '2017-12-04',
  reportId: 'rpt-1',
  summary: '8 of 10 messages aligned for example.com. 2 did not. Published policy is quarantine.',
  totals: { messages: 10, aligned: 8, failed: 2 },
  alignedPercent: 80,
  sources: [
    {
      sourceIp: '203.0.113.10',
      headerFrom: 'example.com',
      count: 8,
      disposition: 'none',
      dkim: 'pass',
      spf: 'fail',
      aligned: true,
    },
    {
      sourceIp: '198.51.100.4',
      headerFrom: 'example.com',
      count: 2,
      disposition: 'quarantine',
      dkim: 'fail',
      spf: 'fail',
      aligned: false,
    },
  ],
};

describe('DMARC Reports page', () => {
  beforeEach(() => {
    ReportsService.read.mockReset();
    ReportsService.loadOffer.mockResolvedValue({
      name: 'DMARC Reports API',
      type: 'reports',
      plan: 'monthly',
      usd: 15,
      checkoutPaused: true,
      endpoint: 'POST /api/dmarc-reports',
    });
    ReportsService.getKey.mockReturnValue(null);
  });

  test('paints pasted XML in light ink on the dark field', () => {
    expect(reportsCss).toMatch(/body\[data-theme='dark'\] \.reports-page textarea[\s\S]*-webkit-text-fill-color: #e0e0e0/);
    expect(reportsCss).toMatch(/body\[data-theme='dark'\] \.reports-page textarea[\s\S]*color-scheme: dark/);
  });

  test('stacks the volume bar above the form on narrow screens', () => {
    expect(reportsCss).toMatch(/@media \(max-width: 640px\)[\s\S]*\.reports-work \{[\s\S]*flex-direction: column/);
    expect(reportsCss).toMatch(/@media \(max-width: 640px\)[\s\S]*\.reports-form textarea \{[\s\S]*min-height: 140px/);
  });

  test('starts empty, with the volume bar waiting and one primary action', async () => {
    renderReports();

    expect(screen.getByRole('heading', { name: 'DMARC Reports' })).toBeInTheDocument();
    expect(screen.getByTestId('reports-volume-stamp')).toHaveTextContent('—');
    expect(screen.getByTestId('reports-volume-fill')).toHaveStyle({ width: '0%' });
    expect(screen.getByTestId('reports-empty')).toHaveTextContent(/nothing you paste is stored/i);
    expect(screen.getByRole('button', { name: 'Read this report' })).toBeEnabled();
    expect(await screen.findByTestId('reports-price')).toHaveTextContent('$15 per month');
    expect(screen.getByRole('button', { name: 'Buy the DMARC Reports API' })).toBeDisabled();
  });

  test('shows an error and does not read an empty paste', async () => {
    renderReports();

    fireEvent.click(screen.getByRole('button', { name: 'Read this report' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Paste a DMARC aggregate report first.');
    expect(ReportsService.read).not.toHaveBeenCalled();
    expect(screen.queryByTestId('reports-result')).not.toBeInTheDocument();
    expect(screen.getByTestId('reports-volume-stamp')).toHaveTextContent('—');
  });

  test('fills the volume bar and lists sources for a pasted report', async () => {
    ReportsService.read.mockResolvedValue(mixedReport);
    renderReports();

    fireEvent.change(screen.getByLabelText('Aggregate report'), {
      target: { value: '<feedback></feedback>' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Read this report' }));

    expect(await screen.findByTestId('reports-result')).toHaveTextContent('Mixed');
    expect(screen.getByTestId('reports-result')).toHaveTextContent('8 of 10 messages aligned');
    expect(screen.getByTestId('reports-volume-stamp')).toHaveTextContent('Mixed');
    expect(screen.getByTestId('reports-volume-fill')).toHaveStyle({ width: '80%' });
    expect(screen.getByText('203.0.113.10')).toBeInTheDocument();
    expect(screen.getByText('198.51.100.4')).toBeInTheDocument();
    expect(screen.queryByTestId('reports-empty')).not.toBeInTheDocument();
  });

  test('clears the previous report when the next paste cannot be read', async () => {
    ReportsService.read.mockResolvedValueOnce(mixedReport);
    ReportsService.read.mockRejectedValueOnce(new Error('That is not a DMARC aggregate report.'));
    renderReports();

    fireEvent.change(screen.getByLabelText('Aggregate report'), {
      target: { value: '<feedback></feedback>' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Read this report' }));
    expect(await screen.findByTestId('reports-result')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Aggregate report'), {
      target: { value: '<note>nope</note>' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Read this report' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('That is not a DMARC aggregate report.');
    expect(screen.queryByTestId('reports-result')).not.toBeInTheDocument();
    expect(screen.getByTestId('reports-volume-stamp')).toHaveTextContent('—');
    expect(screen.getByTestId('reports-volume-fill')).toHaveStyle({ width: '0%' });
  });
});
