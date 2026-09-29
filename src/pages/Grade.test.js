import React from 'react';
import { readFileSync } from 'fs';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Grade from './Grade';
import GradeService from '../services/GradeService';

const gradeCss = readFileSync(require.resolve('./Grade.css'), 'utf8');

jest.mock('../services/GradeService', () => ({
  grade: jest.fn(),
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

describe('Mail Grade page', () => {
  beforeEach(() => {
    GradeService.grade.mockReset();
    GradeService.loadOffer.mockResolvedValue({
      name: 'Mail Grade API',
      type: 'grade',
      plan: 'monthly',
      usd: 9,
      checkoutPaused: true,
      endpoint: 'POST /api/mail-grade',
    });
    GradeService.getKey.mockReturnValue(null);
  });

  test('paints pasted mail in light ink on the dark field', () => {
    expect(gradeCss).toMatch(/body\[data-theme='dark'\] \.grade-page textarea[\s\S]*-webkit-text-fill-color: #e0e0e0/);
    expect(gradeCss).toMatch(/body\[data-theme='dark'\] \.grade-page textarea[\s\S]*color-scheme: dark/);
  });

  test('starts empty, with the stamp waiting and one primary action', async () => {
    render(<Grade />);

    expect(screen.getByRole('heading', { name: 'Mail Grade' })).toBeInTheDocument();
    expect(screen.getByTestId('grade-stamp')).toHaveTextContent('—');
    expect(screen.getByTestId('grade-empty')).toHaveTextContent(/nothing you paste is stored/i);
    expect(screen.getByRole('button', { name: 'Grade this email' })).toBeEnabled();
    expect(await screen.findByTestId('grade-price')).toHaveTextContent('$9 per month');
    expect(screen.getByRole('button', { name: 'Buy the Mail Grade API' })).toBeDisabled();
  });

  test('shows an error and does not grade an empty paste', async () => {
    render(<Grade />);

    fireEvent.click(screen.getByRole('button', { name: 'Grade this email' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Paste a raw email first.');
    expect(GradeService.grade).not.toHaveBeenCalled();
    expect(screen.queryByTestId('grade-result')).not.toBeInTheDocument();
  });

  test('stamps the letter returned for a pasted email', async () => {
    GradeService.grade.mockResolvedValue({
      score: 96,
      grade: 'A',
      summary: 'This message looks ready to send.',
      stored: false,
      findings: [
        { id: 'from_present', severity: 'pass', title: 'From is present', detail: 'From ada@example.com.' },
      ],
    });
    render(<Grade />);

    fireEvent.change(screen.getByLabelText('Raw email'), {
      target: { value: 'From: Ada <ada@example.com>\nSubject: Hello\n\nHi' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Grade this email' }));

    expect(await screen.findByTestId('grade-result')).toHaveTextContent('Grade A');
    expect(screen.getByTestId('grade-stamp')).toHaveTextContent('A');
    expect(screen.getByText('This message looks ready to send.')).toBeInTheDocument();
    expect(screen.getByText('From is present')).toBeInTheDocument();
    await waitFor(() => {
      expect(GradeService.grade).toHaveBeenCalledWith(expect.stringContaining('From: Ada'));
    });
  });

  test('shows the grader error and clears any previous stamp', async () => {
    GradeService.grade.mockRejectedValue(new Error(
      'That text has no email headers. Paste the raw source, including From or Subject.'
    ));
    render(<Grade />);

    fireEvent.change(screen.getByLabelText('Raw email'), {
      target: { value: 'hello there' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Grade this email' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no email headers/i);
    expect(screen.getByTestId('grade-stamp')).toHaveTextContent('—');
    expect(screen.queryByTestId('grade-result')).not.toBeInTheDocument();
  });
});
