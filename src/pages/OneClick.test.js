import React from 'react';
import { readFileSync } from 'fs';
import { MemoryRouter } from 'react-router';
import { render, screen, fireEvent } from '@testing-library/react';
import OneClick from './OneClick';
import OneClickService from '../services/OneClickService';

const oneClickCss = readFileSync(require.resolve('./OneClick.css'), 'utf8');

jest.mock('../services/OneClickService', () => ({
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

const renderOneClick = () => render(
  <MemoryRouter>
    <OneClick />
  </MemoryRouter>
);

const passing = {
  stored: false,
  verdict: 'pass',
  stamp: 'PASS',
  summary: 'A receiver can POST one-click to https://sender.example/unsub.',
  postUri: 'https://sender.example/unsub',
  postHeader: 'List-Unsubscribe=One-Click',
  mailtoUris: ['mailto:unsub@sender.example'],
  httpUris: [],
  reasons: [],
};

describe('One-Click page', () => {
  beforeEach(() => {
    OneClickService.read.mockReset();
    OneClickService.loadOffer.mockResolvedValue({
      name: 'One-Click API',
      type: 'oneclick',
      plan: 'monthly',
      usd: 27,
      checkoutPaused: true,
      endpoint: 'POST /api/one-click-read',
    });
    OneClickService.getKey.mockReturnValue(null);
  });

  test('paints pasted messages in light ink on the dark field', () => {
    expect(oneClickCss).toMatch(/body\[data-theme='dark'\] \.oneclick-page textarea[\s\S]*-webkit-text-fill-color: #e0e0e0/);
    expect(oneClickCss).toMatch(/body\[data-theme='dark'\] \.oneclick-page textarea[\s\S]*color-scheme: dark/);
  });

  test('keeps a visible orange focus ring and wraps the stamp on a narrow screen', () => {
    expect(oneClickCss).toMatch(/\.oneclick-page textarea:focus-visible[\s\S]*outline: 3px solid var\(--duck-orange\)/);
    expect(oneClickCss).toMatch(/@media \(max-width: 640px\)[\s\S]*\.oneclick-slip \{[\s\S]*flex-wrap: wrap/);
    expect(oneClickCss).toMatch(/@media \(max-width: 640px\)[\s\S]*\.oneclick-form textarea \{[\s\S]*min-height: 120px/);
    expect(oneClickCss).toMatch(/@media \(max-width: 640px\)[\s\S]*\.oneclick-submit,\s*\.oneclick-offer button \{[\s\S]*width: 100%/);
  });

  test('starts empty, with the stamp waiting and one primary action', async () => {
    renderOneClick();

    expect(screen.getByRole('heading', { name: 'One-Click' })).toBeInTheDocument();
    expect(screen.getByTestId('oneclick-stamp')).toHaveTextContent('—');
    expect(screen.getByTestId('oneclick-slip')).toHaveTextContent(/one-click URL shows up here/i);
    expect(screen.getByTestId('oneclick-empty')).toHaveTextContent(/nothing you paste is stored/i);
    expect(screen.getByRole('button', { name: 'Check one-click' })).toBeEnabled();
    expect(screen.queryByTestId('oneclick-result')).not.toBeInTheDocument();
    expect(await screen.findByTestId('oneclick-price')).toHaveTextContent('$27 per month');
    expect(screen.getByRole('button', { name: 'Buy the One-Click API' })).toBeDisabled();
  });

  test('shows an error and does not check an empty paste', async () => {
    renderOneClick();

    fireEvent.click(screen.getByRole('button', { name: 'Check one-click' }));

    expect(await screen.findByTestId('oneclick-error')).toHaveTextContent('Paste a message first.');
    expect(OneClickService.read).not.toHaveBeenCalled();
    expect(screen.queryByTestId('oneclick-result')).not.toBeInTheDocument();
    expect(screen.getByTestId('oneclick-stamp')).toHaveTextContent('—');
  });

  test('stamps a passing message with the POST URL', async () => {
    OneClickService.read.mockResolvedValue(passing);
    renderOneClick();

    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'From: News <news@sender.example>\nList-Unsubscribe: <https://sender.example/unsub>' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Check one-click' }));

    expect(await screen.findByTestId('oneclick-result')).toBeInTheDocument();
    expect(screen.getByTestId('oneclick-stamp')).toHaveTextContent('PASS');
    expect(screen.getByTestId('oneclick-url')).toHaveTextContent('https://sender.example/unsub');
    expect(screen.queryByTestId('oneclick-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('oneclick-empty')).not.toBeInTheDocument();
  });

  test('clears the stamp when a later check fails', async () => {
    OneClickService.read
      .mockResolvedValueOnce(passing)
      .mockRejectedValueOnce(new Error('That paste is not an email.'));
    renderOneClick();

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'From: a@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check one-click' }));
    expect(await screen.findByTestId('oneclick-stamp')).toHaveTextContent('PASS');

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'not an email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check one-click' }));

    expect(await screen.findByTestId('oneclick-error')).toHaveTextContent('That paste is not an email.');
    expect(screen.getByTestId('oneclick-stamp')).toHaveTextContent('—');
    expect(screen.queryByTestId('oneclick-result')).not.toBeInTheDocument();
  });
});
