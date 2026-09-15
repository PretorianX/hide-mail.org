import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import RestoreKeyPanel from './RestoreKeyPanel';
import RestoreKeyService from '../services/RestoreKeyService';

jest.mock('../services/RestoreKeyService');

const renderPanel = (props = {}) =>
  render(
    <MemoryRouter>
      <RestoreKeyPanel email="jane@hide-mail.org" isPro={false} {...props} />
    </MemoryRouter>
  );

describe('RestoreKeyPanel', () => {
  beforeEach(() => {
    RestoreKeyService.issue.mockResolvedValue({
      key: 'HMR-4F7K-2QMT-9XB3',
      email: 'jane@hide-mail.org',
      ttlSeconds: 1800,
      expiresAt: new Date(Date.now() + 1800000).toISOString(),
    });
    RestoreKeyService.revoke.mockResolvedValue(true);
  });

  test('offers to create a key before one exists', () => {
    renderPanel();

    expect(screen.getByRole('button', { name: /get a restore key/i })).toBeInTheDocument();
    expect(screen.queryByTestId('restore-key-value')).not.toBeInTheDocument();
  });

  test('shows the key and how long it works once created', async () => {
    renderPanel();

    await userEvent.click(screen.getByRole('button', { name: /get a restore key/i }));

    expect(await screen.findByTestId('restore-key-value')).toHaveTextContent('HMR-4F7K-2QMT-9XB3');
    expect(RestoreKeyService.issue).toHaveBeenCalledWith('jane@hide-mail.org', { rotate: false });
    expect(screen.getByTestId('restore-key-expiry')).toHaveTextContent('30 minutes');
  });

  test('copies the key to the clipboard', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderPanel();

    await userEvent.click(screen.getByRole('button', { name: /get a restore key/i }));
    await screen.findByTestId('restore-key-value');
    await userEvent.click(screen.getByRole('button', { name: /copy key/i }));

    expect(writeText).toHaveBeenCalledWith('HMR-4F7K-2QMT-9XB3');
    expect(await screen.findByText(/copied/i)).toBeInTheDocument();
  });

  test('links to the restore page with the key prefilled', async () => {
    renderPanel();

    await userEvent.click(screen.getByRole('button', { name: /get a restore key/i }));

    const link = await screen.findByTestId('restore-key-link');
    expect(link).toHaveAttribute('href', '/restore?key=HMR-4F7K-2QMT-9XB3');
  });

  test('rotating asks for a replacement key', async () => {
    renderPanel();

    await userEvent.click(screen.getByRole('button', { name: /get a restore key/i }));
    await screen.findByTestId('restore-key-value');

    RestoreKeyService.issue.mockResolvedValue({
      key: 'HMR-0000-0000-0001',
      email: 'jane@hide-mail.org',
      ttlSeconds: 1800,
      expiresAt: new Date(Date.now() + 1800000).toISOString(),
    });
    await userEvent.click(screen.getByRole('button', { name: /new key/i }));

    expect(RestoreKeyService.issue).toHaveBeenLastCalledWith('jane@hide-mail.org', { rotate: true });
    expect(await screen.findByTestId('restore-key-value')).toHaveTextContent('HMR-0000-0000-0001');
  });

  test('forgetting the key hides it and offers a new one', async () => {
    renderPanel();

    await userEvent.click(screen.getByRole('button', { name: /get a restore key/i }));
    await screen.findByTestId('restore-key-value');
    await userEvent.click(screen.getByRole('button', { name: /forget key/i }));

    expect(RestoreKeyService.revoke).toHaveBeenCalledWith('jane@hide-mail.org');
    await waitFor(() => expect(screen.queryByTestId('restore-key-value')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /get a restore key/i })).toBeInTheDocument();
  });

  test('explains a mailbox that has gone away', async () => {
    RestoreKeyService.issue.mockRejectedValue(
      Object.assign(new Error('This inbox is no longer active, so it cannot be reopened.'), {
        code: 'MAILBOX_NOT_ACTIVE',
      })
    );
    renderPanel();

    await userEvent.click(screen.getByRole('button', { name: /get a restore key/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no longer active/i);
  });

  test('tells a free user the key dies with the 30 minute address, and points at Pro', async () => {
    renderPanel({ isPro: false });

    await userEvent.click(screen.getByRole('button', { name: /get a restore key/i }));
    await screen.findByTestId('restore-key-value');

    expect(screen.getByTestId('restore-key-upgrade')).toHaveTextContent(/30 minutes/i);
    expect(screen.getByTestId('restore-key-upgrade-link')).toHaveAttribute('href', '/pro');
  });

  test('leaves a Pro user without an upsell', async () => {
    RestoreKeyService.issue.mockResolvedValue({
      key: 'HMR-4F7K-2QMT-9XB3',
      email: 'jane@hide-mail.org',
      ttlSeconds: 604800,
      expiresAt: new Date(Date.now() + 604800000).toISOString(),
    });
    renderPanel({ isPro: true });

    await userEvent.click(screen.getByRole('button', { name: /get a restore key/i }));
    await screen.findByTestId('restore-key-value');

    expect(screen.getByTestId('restore-key-expiry')).toHaveTextContent('7 days');
    expect(screen.queryByTestId('restore-key-upgrade')).not.toBeInTheDocument();
  });

  test('always links to the page that reopens an inbox', () => {
    renderPanel();

    expect(screen.getByTestId('restore-page-link')).toHaveAttribute('href', '/restore');
  });

  test('drops a key that belonged to a previous address', async () => {
    const { rerender } = renderPanel();

    await userEvent.click(screen.getByRole('button', { name: /get a restore key/i }));
    await screen.findByTestId('restore-key-value');

    rerender(
      <MemoryRouter>
        <RestoreKeyPanel email="someone.else@hide-mail.org" isPro={false} />
      </MemoryRouter>
    );

    expect(screen.queryByTestId('restore-key-value')).not.toBeInTheDocument();
  });

  test('renders nothing without a mailbox', () => {
    const { container } = renderPanel({ email: null });

    expect(container).toBeEmptyDOMElement();
  });
});
