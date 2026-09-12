import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import RestoreInbox from './RestoreInbox';
import RestoreKeyService from '../services/RestoreKeyService';

jest.mock('../services/RestoreKeyService');

const mockNavigate = jest.fn();
let mockSearch = '';

jest.mock('react-router', () => {
  const actual = jest.requireActual('react-router');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ pathname: '/restore', search: mockSearch, hash: '', state: null }),
  };
});

const renderPage = (props = {}) =>
  render(
    <MemoryRouter>
      <RestoreInbox onRestored={jest.fn()} {...props} />
    </MemoryRouter>
  );

describe('RestoreInbox', () => {
  beforeEach(() => {
    mockSearch = '';
    mockNavigate.mockReset();
    RestoreKeyService.redeem.mockResolvedValue({
      email: 'jane@hide-mail.org',
      ttlSeconds: 1200,
      expiresAt: new Date(Date.now() + 1200000).toISOString(),
    });
  });

  test('asks for a key', () => {
    renderPage();

    expect(screen.getByLabelText(/restore key/i)).toHaveValue('');
    expect(screen.getByRole('button', { name: /reopen inbox/i })).toBeInTheDocument();
  });

  test('prefills the key that arrived in the link', () => {
    mockSearch = '?key=HMR-4F7K-2QMT-9XB3';

    renderPage();

    expect(screen.getByLabelText(/restore key/i)).toHaveValue('HMR-4F7K-2QMT-9XB3');
  });

  test('redeems the key and hands the mailbox to the app', async () => {
    const onRestored = jest.fn();
    renderPage({ onRestored });

    await userEvent.type(screen.getByLabelText(/restore key/i), 'HMR-4F7K-2QMT-9XB3');
    await userEvent.click(screen.getByRole('button', { name: /reopen inbox/i }));

    expect(RestoreKeyService.redeem).toHaveBeenCalledWith('HMR-4F7K-2QMT-9XB3');
    expect(onRestored).toHaveBeenCalledWith('jane@hide-mail.org', 1200);
  });

  test('shows the reopened address and how long it has left', async () => {
    mockSearch = '?key=HMR-4F7K-2QMT-9XB3';
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /reopen inbox/i }));

    const confirmation = await screen.findByTestId('restore-success');
    expect(confirmation).toHaveTextContent('jane@hide-mail.org');
    expect(confirmation).toHaveTextContent('20 minutes');
  });

  test('sends the user to the inbox once the mailbox is adopted', async () => {
    mockSearch = '?key=HMR-4F7K-2QMT-9XB3';
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /reopen inbox/i }));
    await screen.findByTestId('restore-success');
    await userEvent.click(screen.getByRole('button', { name: /open the inbox/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  test('explains a key that matches nothing', async () => {
    RestoreKeyService.redeem.mockRejectedValue(
      Object.assign(new Error('That restore key does not match a live inbox. It may have expired.'), {
        code: 'RESTORE_KEY_UNKNOWN',
      })
    );
    renderPage();

    await userEvent.type(screen.getByLabelText(/restore key/i), 'HMR-0000-0000-0000');
    await userEvent.click(screen.getByRole('button', { name: /reopen inbox/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/does not match a live inbox/i);
  });

  test('does not call the backend without a key', async () => {
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /reopen inbox/i }));

    expect(RestoreKeyService.redeem).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(/enter the restore key/i);
  });

  test('says what a restore key is for people who arrive here cold', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: /reopen a hide mail inbox/i })).toBeInTheDocument();
    expect(screen.getByTestId('restore-explainer')).toHaveTextContent(/restore key/i);
  });
});
