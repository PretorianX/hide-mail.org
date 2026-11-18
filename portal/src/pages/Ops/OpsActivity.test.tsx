import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MailDuckThemeProvider } from '@/design-system';
import { OpsActivity } from './OpsActivity';
import { listAdminActivity } from '@/api/admin';

jest.mock('@/api/admin', () => ({
  listAdminActivity: jest.fn(),
}));

const messages = [
  {
    id: 'm1',
    accountId: 'acct-1',
    accountLabel: 'acme',
    domain: 'a.example.com',
    recipient: 'gone@example.org',
    reference: null,
    subject: 'Password reset',
    from: { name: 'Auth', email: 'noreply@a.example.com' },
    envelopeFrom: 'b-m1@hm-bounce.a.example.com',
    clientIp: '203.0.113.10',
    sendKeyName: 'prod',
    status: 'bounced',
    createdAt: 1,
    lastEventAt: 2,
    lastResponse: '550 5.1.1 user unknown',
  },
  {
    id: 'm2',
    accountId: 'acct-2',
    accountLabel: 'beta',
    domain: 'b.example.com',
    recipient: 'ok@example.org',
    reference: null,
    subject: 'Welcome',
    from: { name: null, email: 'hello@b.example.com' },
    envelopeFrom: 'b-m2@hm-bounce.b.example.com',
    clientIp: '198.51.100.7',
    sendKeyName: 'ci',
    status: 'delivered',
    createdAt: 3,
    lastEventAt: 4,
    lastResponse: 'accepted by postfix',
  },
];

describe('OpsActivity', () => {
  beforeEach(() => {
    jest.mocked(listAdminActivity).mockResolvedValue(messages);
  });

  it('lists cross-account activity and opens a detail drawer', async () => {
    const user = userEvent.setup();
    render(
      <MailDuckThemeProvider>
        <MemoryRouter>
          <OpsActivity />
        </MemoryRouter>
      </MailDuckThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Password reset')).toBeInTheDocument();
    });
    expect(screen.getAllByText('acme').length).toBeGreaterThan(0);
    expect(screen.getAllByText('beta').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('row', { name: /Password reset/i }));
    const drawer = await screen.findByRole('dialog', { name: /message detail/i });
    expect(within(drawer).getByText('Auth <noreply@a.example.com>')).toBeInTheDocument();
    expect(within(drawer).getByText('203.0.113.10')).toBeInTheDocument();
    expect(within(drawer).getByText('acme')).toBeInTheDocument();
  });

  it('filters by account and search', async () => {
    const user = userEvent.setup();
    render(
      <MailDuckThemeProvider>
        <MemoryRouter>
          <OpsActivity />
        </MemoryRouter>
      </MailDuckThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Welcome')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText(/filter by account/i), 'beta');
    expect(screen.queryByText('Password reset')).not.toBeInTheDocument();
    expect(screen.getByText('Welcome')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/filter by account/i), 'all');
    await user.type(screen.getByRole('searchbox', { name: /search activity/i }), '5.1.1');
    expect(screen.getByText('Password reset')).toBeInTheDocument();
    expect(screen.queryByText('Welcome')).not.toBeInTheDocument();
  });
});
