import React from 'react';
import { readFileSync } from 'fs';
import { MemoryRouter } from 'react-router';
import { render, screen, fireEvent } from '@testing-library/react';
import Complaints from './Complaints';
import ComplaintService from '../services/ComplaintService';

const complaintCss = readFileSync(require.resolve('./Complaints.css'), 'utf8');

jest.mock('../services/ComplaintService', () => ({
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

const renderComplaints = () => render(
  <MemoryRouter>
    <Complaints />
  </MemoryRouter>
);

const abuseReport = {
  stored: false,
  stamp: 'ABUSE',
  feedbackType: 'abuse',
  action: 'suppress',
  actionLabel: 'Remove this address from the list.',
  recipient: 'subscriber@example.net',
  mailFrom: 'news@sender.example',
  sourceIp: '192.0.2.1',
  reportedDomain: 'sender.example',
  userAgent: 'ExampleFBL/1.0',
  receivedDate: null,
  arrivalDate: null,
};

describe('Complaint Read page', () => {
  beforeEach(() => {
    ComplaintService.read.mockReset();
    ComplaintService.loadOffer.mockResolvedValue({
      name: 'Complaint Read API',
      type: 'complaint',
      plan: 'monthly',
      usd: 21,
      checkoutPaused: true,
      endpoint: 'POST /api/complaint-read',
    });
    ComplaintService.getKey.mockReturnValue(null);
  });

  test('paints pasted reports in light ink on the dark field', () => {
    expect(complaintCss).toMatch(/body\[data-theme='dark'\] \.complaint-page textarea[\s\S]*-webkit-text-fill-color: #e0e0e0/);
    expect(complaintCss).toMatch(/body\[data-theme='dark'\] \.complaint-page textarea[\s\S]*color-scheme: dark/);
  });

  test('keeps a visible orange focus ring and wraps the slip on a narrow screen', () => {
    expect(complaintCss).toMatch(/\.complaint-page textarea:focus-visible[\s\S]*outline: 3px solid var\(--duck-orange\)/);
    expect(complaintCss).toMatch(/@media \(max-width: 640px\)[\s\S]*\.complaint-slip \{[\s\S]*flex-wrap: wrap/);
    expect(complaintCss).toMatch(/@media \(max-width: 640px\)[\s\S]*\.complaint-form textarea \{[\s\S]*min-height: 120px/);
    expect(complaintCss).toMatch(/@media \(max-width: 640px\)[\s\S]*\.complaint-submit,\s*\.complaint-offer button \{[\s\S]*width: 100%/);
  });

  test('starts empty, with the slip waiting and one primary action', async () => {
    renderComplaints();

    expect(screen.getByRole('heading', { name: 'Complaint Read' })).toBeInTheDocument();
    expect(screen.getByTestId('complaint-stamp')).toHaveTextContent('—');
    expect(screen.getByTestId('complaint-slip')).toHaveTextContent(/address to act on shows up here/i);
    expect(screen.getByTestId('complaint-empty')).toHaveTextContent(/nothing you paste is stored/i);
    expect(screen.getByRole('button', { name: 'Read this complaint' })).toBeEnabled();
    expect(screen.queryByTestId('complaint-result')).not.toBeInTheDocument();
    expect(await screen.findByTestId('complaint-price')).toHaveTextContent('$21 per month');
    expect(screen.getByRole('button', { name: 'Buy the Complaint Read API' })).toBeDisabled();
  });

  test('shows an error and does not read an empty paste', async () => {
    renderComplaints();

    fireEvent.click(screen.getByRole('button', { name: 'Read this complaint' }));

    expect(await screen.findByTestId('complaint-error')).toHaveTextContent('Paste a feedback report first.');
    expect(ComplaintService.read).not.toHaveBeenCalled();
    expect(screen.queryByTestId('complaint-result')).not.toBeInTheDocument();
    expect(screen.getByTestId('complaint-stamp')).toHaveTextContent('—');
  });

  test('stamps the slip with the address to remove', async () => {
    ComplaintService.read.mockResolvedValue(abuseReport);
    renderComplaints();

    fireEvent.change(screen.getByLabelText('Feedback report'), {
      target: { value: 'Feedback-Type: abuse\nOriginal-Rcpt-To: <subscriber@example.net>' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Read this complaint' }));

    expect(await screen.findByTestId('complaint-result')).toHaveTextContent('ABUSE');
    expect(screen.getByTestId('complaint-stamp')).toHaveTextContent('ABUSE');
    expect(screen.getByTestId('complaint-address')).toHaveTextContent('subscriber@example.net');
    expect(screen.getByTestId('complaint-slip')).toHaveTextContent('Remove this address from the list.');
    expect(screen.getByTestId('complaint-result')).toHaveTextContent('192.0.2.1');
    expect(screen.queryByTestId('complaint-empty')).not.toBeInTheDocument();
    expect(ComplaintService.read).toHaveBeenCalledWith(expect.stringContaining('Feedback-Type: abuse'));
  });

  test('clears the slip when the report cannot be read', async () => {
    ComplaintService.read
      .mockResolvedValueOnce(abuseReport)
      .mockRejectedValueOnce(new Error('That text is not an abuse feedback report.'));
    renderComplaints();

    fireEvent.change(screen.getByLabelText('Feedback report'), {
      target: { value: 'Feedback-Type: abuse\nOriginal-Rcpt-To: <subscriber@example.net>' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Read this complaint' }));
    expect(await screen.findByTestId('complaint-address')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Feedback report'), {
      target: { value: 'From: Ada <ada@example.com>\n\nHi' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Read this complaint' }));

    expect(await screen.findByTestId('complaint-error')).toHaveTextContent(
      'That text is not an abuse feedback report.'
    );
    expect(screen.queryByTestId('complaint-address')).not.toBeInTheDocument();
    expect(screen.queryByTestId('complaint-result')).not.toBeInTheDocument();
    expect(screen.getByTestId('complaint-stamp')).toHaveTextContent('—');
  });
});
