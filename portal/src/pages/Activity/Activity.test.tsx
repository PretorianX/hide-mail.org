import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MailDuckThemeProvider } from '@/design-system';
import { Activity } from '@/pages/Activity/Activity';
import { mockJsonFetch } from '@/test/mockFetch';

const sampleMessages = [
  {
    id: 'm1',
    accountId: 'a1',
    domain: 'mail.example.com',
    recipient: 'gone@example.org',
    reference: 'ref-1',
    subject: 'Password reset',
    from: { name: 'Auth', email: 'noreply@mail.example.com' },
    envelopeFrom: 'b-m1@hm-bounce.mail.example.com',
    clientIp: '203.0.113.10',
    sendKeyName: 'prod',
    status: 'bounced',
    createdAt: 1,
    lastEventAt: 2,
    lastResponse: '550 5.1.1 user unknown',
  },
  {
    id: 'm2',
    accountId: 'a1',
    domain: 'mail.example.com',
    recipient: 'ok@example.org',
    reference: null,
    subject: 'Welcome aboard',
    from: { name: null, email: 'hello@mail.example.com' },
    envelopeFrom: 'b-m2@hm-bounce.mail.example.com',
    clientIp: '198.51.100.7',
    sendKeyName: 'ci',
    status: 'delivered',
    createdAt: 3,
    lastEventAt: 4,
    lastResponse: 'accepted by postfix',
  },
];

describe('Activity', () => {
  beforeEach(() => {
    localStorage.setItem('hm_outbound_license', 'HM-AAAA-BBBB-CCCC-DDDD');
    jest.restoreAllMocks();
  });

  it('renders subject in the table and opens a detail drawer on row click', async () => {
    const user = userEvent.setup();
    mockJsonFetch(() => ({
      status: 200,
      body: { success: true, messages: sampleMessages },
    }));

    render(
      <MemoryRouter>
        <MailDuckThemeProvider>
          <Activity />
        </MailDuckThemeProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Password reset')).toBeInTheDocument();
    });
    expect(screen.getByText('Welcome aboard')).toBeInTheDocument();

    await user.click(screen.getByRole('row', { name: /Password reset/i }));

    const drawer = await screen.findByRole('dialog', { name: /message detail/i });
    expect(within(drawer).getByText('Auth <noreply@mail.example.com>')).toBeInTheDocument();
    expect(within(drawer).getByText('b-m1@hm-bounce.mail.example.com')).toBeInTheDocument();
    expect(within(drawer).getByText('203.0.113.10')).toBeInTheDocument();
    expect(within(drawer).getByText('prod')).toBeInTheDocument();
    expect(within(drawer).getByText(/5\.1\.1/)).toBeInTheDocument();
  });

  it('filters the table by search across fields', async () => {
    const user = userEvent.setup();
    mockJsonFetch(() => ({
      status: 200,
      body: { success: true, messages: sampleMessages },
    }));

    render(
      <MemoryRouter>
        <MailDuckThemeProvider>
          <Activity />
        </MailDuckThemeProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Password reset')).toBeInTheDocument();
    });

    await user.type(screen.getByRole('searchbox', { name: /search activity/i }), 'ci');

    expect(screen.queryByText('Password reset')).not.toBeInTheDocument();
    expect(screen.getByText('Welcome aboard')).toBeInTheDocument();
  });

  it('closes the drawer with Escape', async () => {
    const user = userEvent.setup();
    mockJsonFetch(() => ({
      status: 200,
      body: { success: true, messages: sampleMessages },
    }));

    render(
      <MemoryRouter>
        <MailDuckThemeProvider>
          <Activity />
        </MailDuckThemeProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Password reset')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('row', { name: /Password reset/i }));
    expect(await screen.findByRole('dialog', { name: /message detail/i })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /message detail/i })).not.toBeInTheDocument();
    });
  });

  it('renders suppressed status with a link to the suppression entry in table and drawer', async () => {
    const user = userEvent.setup();
    mockJsonFetch(() => ({
      status: 200,
      body: {
        success: true,
        messages: [
          {
            id: 'm3',
            accountId: 'a1',
            domain: 'mail.example.com',
            recipient: 'info+122212@armtek.org',
            reference: null,
            subject: 'Blocked attempt',
            from: { name: 'App', email: 'noreply@mail.example.com' },
            envelopeFrom: null,
            clientIp: '203.0.113.10',
            sendKeyName: 'prod',
            status: 'suppressed',
            createdAt: 5,
            lastEventAt: null,
            lastResponse: '550 5.0.0 550 Unrouteable address',
          },
        ],
      },
    }));

    render(
      <MemoryRouter>
        <MailDuckThemeProvider>
          <Activity />
        </MailDuckThemeProvider>
      </MemoryRouter>,
    );

    const link = await screen.findByRole('link', { name: /view suppression/i });
    expect(link).toHaveAttribute(
      'href',
      '/suppressions?email=info%2B122212%40armtek.org',
    );
    expect(screen.getByText('suppressed')).toBeInTheDocument();

    await user.click(screen.getByRole('row', { name: /Blocked attempt/i }));
    const drawer = await screen.findByRole('dialog', { name: /message detail/i });
    const drawerLink = within(drawer).getByRole('link', { name: /view suppression entry/i });
    expect(drawerLink).toHaveAttribute(
      'href',
      '/suppressions?email=info%2B122212%40armtek.org',
    );
  });
});
