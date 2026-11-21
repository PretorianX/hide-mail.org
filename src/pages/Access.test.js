import React from 'react';
import { readFileSync } from 'fs';
import { MemoryRouter } from 'react-router';
import { render, screen, fireEvent } from '@testing-library/react';
import Access from './Access';
import AccessService from '../services/AccessService';

const accessCss = readFileSync(require.resolve('./Access.css'), 'utf8');

jest.mock('../services/AccessService', () => ({
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

const renderAccess = () => render(
  <MemoryRouter>
    <Access />
  </MemoryRouter>
);

const fixReport = {
  stored: false,
  stamp: 'FIX',
  verdict: 'fix',
  summary: '6 barriers: image without a text alternative, link without a name, no language, low contrast, type under 14px, skipped heading.',
  barrierCount: 6,
  barriers: [
    {
      id: 'missing-alt',
      title: 'Image without a text alternative',
      detail: 'An image has no alt text, so a screen reader cannot say what it is.',
      count: 1,
    },
    {
      id: 'unnamed-link',
      title: 'Link without a name',
      detail: 'A link has no text, label, or image description.',
      count: 1,
    },
  ],
};

describe('Access Check page', () => {
  beforeEach(() => {
    AccessService.read.mockReset();
    AccessService.loadOffer.mockResolvedValue({
      name: 'Access Check API',
      type: 'access',
      plan: 'monthly',
      usd: 30,
      checkoutPaused: true,
      endpoint: 'POST /api/access-read',
    });
    AccessService.getKey.mockReturnValue(null);
  });

  test('paints pasted HTML in light ink on the dark field', () => {
    expect(accessCss).toMatch(/body\[data-theme='dark'\] \.access-page textarea[\s\S]*-webkit-text-fill-color: #e0e0e0/);
    expect(accessCss).toMatch(/body\[data-theme='dark'\] \.access-page textarea[\s\S]*color-scheme: dark/);
  });

  test('keeps a visible orange focus ring and wraps the slip on a narrow screen', () => {
    expect(accessCss).toMatch(/\.access-page textarea:focus-visible[\s\S]*outline: 3px solid var\(--duck-orange\)/);
    expect(accessCss).toMatch(/@media \(max-width: 640px\)[\s\S]*\.access-slip \{[\s\S]*flex-wrap: wrap/);
    expect(accessCss).toMatch(/@media \(max-width: 640px\)[\s\S]*\.access-form textarea \{[\s\S]*min-height: 120px/);
    expect(accessCss).toMatch(/@media \(max-width: 640px\)[\s\S]*\.access-submit,\s*\.access-offer button \{[\s\S]*width: 100%/);
  });

  test('starts empty, with the stamp waiting and one primary action', async () => {
    renderAccess();

    expect(screen.getByRole('heading', { name: 'Access Check' })).toBeInTheDocument();
    expect(screen.getByTestId('access-stamp')).toHaveTextContent('—');
    expect(screen.getByTestId('access-slip')).toHaveTextContent(/access stamp shows up here/i);
    expect(screen.getByTestId('access-empty')).toHaveTextContent(/nothing you paste is stored/i);
    expect(screen.getByRole('button', { name: 'Check this email' })).toBeEnabled();
    expect(screen.queryByTestId('access-result')).not.toBeInTheDocument();
    expect(await screen.findByTestId('access-price')).toHaveTextContent('$30 per month');
    expect(screen.getByRole('button', { name: 'Buy the Access Check API' })).toBeDisabled();
  });

  test('shows an error and does not read an empty paste', async () => {
    renderAccess();

    fireEvent.click(screen.getByRole('button', { name: 'Check this email' }));

    expect(await screen.findByTestId('access-error')).toHaveTextContent("Paste an email's HTML first.");
    expect(AccessService.read).not.toHaveBeenCalled();
    expect(screen.queryByTestId('access-result')).not.toBeInTheDocument();
    expect(screen.getByTestId('access-stamp')).toHaveTextContent('—');
  });

  test('stamps the barriers in the HTML', async () => {
    AccessService.read.mockResolvedValue(fixReport);
    renderAccess();

    fireEvent.change(screen.getByLabelText('Email HTML'), {
      target: { value: '<html><body><img src="logo.png"></body></html>' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Check this email' }));

    expect(await screen.findByTestId('access-result')).toHaveTextContent('Image without a text alternative');
    expect(screen.getByTestId('access-stamp')).toHaveTextContent('FIX');
    expect(screen.getByTestId('access-summary')).toHaveTextContent('low contrast');
    expect(screen.getByTestId('access-result')).toHaveTextContent('Link without a name');
    expect(screen.queryByTestId('access-empty')).not.toBeInTheDocument();
  });

  test('clears the stamp when the next paste is rejected', async () => {
    AccessService.read
      .mockResolvedValueOnce(fixReport)
      .mockRejectedValueOnce(new Error('Paste the HTML of an email, or a raw message that contains an HTML part.'));
    renderAccess();

    fireEvent.change(screen.getByLabelText('Email HTML'), {
      target: { value: '<html><body><p>Hi</p></body></html>' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Check this email' }));
    expect(await screen.findByTestId('access-result')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Email HTML'), {
      target: { value: 'Just a note.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Check this email' }));

    expect(await screen.findByTestId('access-error')).toHaveTextContent(
      'Paste the HTML of an email, or a raw message that contains an HTML part.'
    );
    expect(screen.queryByTestId('access-result')).not.toBeInTheDocument();
    expect(screen.getByTestId('access-stamp')).toHaveTextContent('—');
  });
});
