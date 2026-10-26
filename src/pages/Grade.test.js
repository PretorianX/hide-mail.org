import React from 'react';
import { readFileSync } from 'fs';
import { MemoryRouter } from 'react-router';
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

jest.mock('../components/GradeReceive', () => () => (
  <div data-testid="grade-receive">receive stub</div>
));

const renderGrade = () => render(
  <MemoryRouter>
    <Grade />
  </MemoryRouter>
);

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

  test('keeps the stamp beside the form on narrow screens so the primary action can fit', () => {
    expect(gradeCss).toMatch(/@media \(max-width: 640px\)[\s\S]*\.grade-work \{[\s\S]*flex-wrap: nowrap/);
    expect(gradeCss).toMatch(/@media \(max-width: 640px\)[\s\S]*\.grade-stamp \{[\s\S]*width: 72px/);
    expect(gradeCss).toMatch(/@media \(max-width: 640px\)[\s\S]*\.grade-form textarea \{[\s\S]*min-height: 120px/);
  });

  test('starts empty, with the stamp waiting and one primary action', async () => {
    renderGrade();

    expect(screen.getByRole('heading', { name: 'Mail Grade' })).toBeInTheDocument();
    expect(screen.getByTestId('grade-stamp')).toHaveTextContent('—');
    expect(screen.getByTestId('grade-empty')).toHaveTextContent(/nothing you paste is stored/i);
    expect(screen.getByRole('button', { name: 'Grade this email' })).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Findings guide' })).toHaveAttribute('href', '/grade/guide');
    expect(screen.getByTestId('grade-receive')).toBeInTheDocument();
    expect(await screen.findByTestId('grade-price')).toHaveTextContent('$9 per month');
    expect(screen.getByRole('button', { name: 'Buy the Mail Grade API' })).toBeDisabled();
  });

  test('shows an error and does not grade an empty paste', async () => {
    renderGrade();

    fireEvent.click(screen.getByRole('button', { name: 'Grade this email' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Paste a raw email first.');
    expect(GradeService.grade).not.toHaveBeenCalled();
    expect(screen.queryByTestId('grade-result')).not.toBeInTheDocument();
  });

  test('stamps the letter returned for a pasted email and links each finding to the guide', async () => {
    GradeService.grade.mockResolvedValue({
      score: 96,
      grade: 'A',
      summary: 'This message looks ready to send.',
      stored: false,
      findings: [
        { id: 'from_present', severity: 'pass', title: 'From is present', detail: 'From ada@example.com.' },
      ],
    });
    renderGrade();

    fireEvent.change(screen.getByLabelText('Raw email'), {
      target: { value: 'From: Ada <ada@example.com>\nSubject: Hello\n\nHi' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Grade this email' }));

    expect(await screen.findByTestId('grade-result')).toHaveTextContent('Grade A');
    expect(screen.getByTestId('grade-stamp')).toHaveTextContent('A');
    expect(screen.getByText('This message looks ready to send.')).toBeInTheDocument();
    expect(screen.getByText('From is present')).toBeInTheDocument();
    expect(screen.getByTestId('grade-group-pass')).toHaveTextContent('Looks good');
    expect(screen.getByTestId('grade-finding-guide-from_present')).toHaveAttribute(
      'href',
      '/grade/guide#from_present'
    );
    expect(screen.getByTestId('grade-finding-guide-from_present')).toHaveTextContent('Why this passed');
    await waitFor(() => {
      expect(GradeService.grade).toHaveBeenCalledWith(expect.stringContaining('From: Ada'));
    });
  });

  test('splits findings into problems, warnings, and what already looks good', async () => {
    GradeService.grade.mockResolvedValue({
      score: 68,
      grade: 'D',
      summary: 'This message has serious quality problems.',
      stored: false,
      findings: [
        { id: 'from_present', severity: 'pass', title: 'From is present', detail: 'From a@b.com.' },
        { id: 'spf_no_ip', severity: 'warn', title: 'SPF needs a sending IP', detail: 'No public Received IP.' },
        { id: 'rbl_domain', severity: 'fail', title: 'Domain on a public blocklist', detail: 'Listed: gmail.com.' },
      ],
    });
    renderGrade();

    fireEvent.change(screen.getByLabelText('Raw email'), {
      target: { value: 'From: a@b.com\nSubject: Hi\n\nHi' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Grade this email' }));

    const result = await screen.findByTestId('grade-result');
    const fail = screen.getByTestId('grade-group-fail');
    const warn = screen.getByTestId('grade-group-warn');
    const pass = screen.getByTestId('grade-group-pass');

    expect(fail).toHaveTextContent('Problems');
    expect(fail).toHaveTextContent('Domain on a public blocklist');
    expect(warn).toHaveTextContent('Warnings');
    expect(warn).toHaveTextContent('SPF needs a sending IP');
    expect(pass).toHaveTextContent('Looks good');
    expect(pass).toHaveTextContent('From is present');
    expect(result.textContent.indexOf('Problems')).toBeLessThan(result.textContent.indexOf('Warnings'));
    expect(result.textContent.indexOf('Warnings')).toBeLessThan(result.textContent.indexOf('Looks good'));
    expect(screen.getByTestId('grade-finding-guide-rbl_domain')).toHaveTextContent('Why & how to fix');
  });

  test('shows the grader error and clears any previous stamp', async () => {
    GradeService.grade.mockRejectedValue(new Error(
      'That text has no email headers. Paste the raw source, including From or Subject.'
    ));
    renderGrade();

    fireEvent.change(screen.getByLabelText('Raw email'), {
      target: { value: 'hello there' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Grade this email' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no email headers/i);
    expect(screen.getByTestId('grade-stamp')).toHaveTextContent('—');
    expect(screen.queryByTestId('grade-result')).not.toBeInTheDocument();
  });

  test('loads a sample email and renders envelope, authentication matrix, and MIME inventory', async () => {
    GradeService.grade.mockResolvedValue({
      score: 94,
      grade: 'A',
      summary: 'This message looks ready to send.',
      stored: false,
      envelope: {
        from: 'Hide Mail Billing <billing@example.com>',
        fromDomain: 'example.com',
        returnPath: 'bounces@example.com',
        replyTo: 'support@example.com',
        subject: 'Your October invoice',
        subjectLength: 20,
        messageId: '<20261026120000.invoice-9812@example.com>',
        contentType: 'multipart/alternative',
        sizeBytes: 912,
        sendingIp: '93.184.216.34',
        receivedHops: 1,
      },
      authentication: {
        spf: { status: 'pass', domain: 'example.com', ip: '93.184.216.34' },
        dkim: { status: 'pass', signingDomain: 'example.com', selector: 's2026', aligned: true },
        dmarc: { status: 'pass', policy: 'reject', domain: 'example.com' },
        listUnsubscribe: { present: true, oneClick: true },
      },
      deliverability: {
        plainTextBytes: 120,
        htmlBytes: 280,
        totalLinks: 1,
        httpsLinks: 1,
        httpLinks: 0,
        uniqueLinkDomains: ['example.com'],
        imageCount: 1,
        imagesMissingAlt: 0,
        attachmentCount: 0,
      },
      findings: [
        {
          id: 'from_present',
          severity: 'pass',
          category: 'headers',
          penalty: 0,
          title: 'From is present',
          detail: 'From billing@example.com.',
        },
      ],
    });
    renderGrade();

    fireEvent.click(screen.getByRole('button', { name: 'Load sample' }));
    expect(screen.getByLabelText('Raw email').value).toContain('Hide Mail Billing');

    fireEvent.click(screen.getByRole('button', { name: 'Grade this email' }));

    expect(await screen.findByTestId('grade-envelope')).toHaveTextContent('93.184.216.34 (1 hop)');
    expect(screen.getByTestId('grade-auth-matrix')).toHaveTextContent('RFC 8058 One-Click enabled');
    expect(screen.getByTestId('grade-deliverability')).toHaveTextContent('1 total (1 HTTPS, 0 HTTP)');
    expect(screen.getByTestId('grade-copy-json')).toBeInTheDocument();
    expect(screen.getByTestId('grade-copy-curl')).toBeInTheDocument();
  });

  test('populates textarea when a valid .eml file is uploaded or dropped, and rejects files over 256 KB', async () => {
    renderGrade();

    const fileInput = screen.getByTestId('grade-file-input');
    expect(fileInput).toHaveAttribute('accept', '.eml,.txt,message/rfc822');

    const emlContent = 'From: Ada <ada@example.com>\r\nSubject: Uploaded EML\r\n\r\nUploaded body.';
    const validFile = new File([emlContent], 'sample.eml', { type: 'message/rfc822' });

    fireEvent.change(fileInput, { target: { files: [validFile] } });

    await waitFor(() => {
      expect(screen.getByLabelText('Raw email').value).toContain('Subject: Uploaded EML');
    });

    const dropzone = screen.getByTestId('grade-dropzone');
    const droppedContent = 'From: Bob <bob@example.com>\r\nSubject: Dropped EML\r\n\r\nDropped body.';
    const droppedFile = new File([droppedContent], 'dropped.eml', { type: 'message/rfc822' });

    fireEvent.dragOver(dropzone);
    fireEvent.drop(dropzone, { dataTransfer: { files: [droppedFile] } });

    await waitFor(() => {
      expect(screen.getByLabelText('Raw email').value).toContain('Subject: Dropped EML');
    });

    const oversizedFile = new File(['x'.repeat(260 * 1024)], 'huge.eml', { type: 'message/rfc822' });
    fireEvent.change(fileInput, { target: { files: [oversizedFile] } });

    expect(await screen.findByRole('alert')).toHaveTextContent(/256 KB/i);
  });
});
