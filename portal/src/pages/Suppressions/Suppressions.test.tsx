import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MailDuckThemeProvider } from '@/design-system';
import { Suppressions } from '@/pages/Suppressions/Suppressions';
import { mockJsonFetch } from '@/test/mockFetch';

describe('Suppressions', () => {
  beforeEach(() => {
    localStorage.setItem('hm_outbound_license', 'HM-AAAA-BBBB-CCCC-DDDD');
    jest.restoreAllMocks();
  });

  it('shows errorMessage, highlights linked email, and removes an entry', async () => {
    const user = userEvent.setup();
    let entries = [
      {
        email: 'info+122212@armtek.org',
        reason: 'hard_bounce',
        errorMessage: '550 5.0.0 550 Unrouteable address',
        addedAt: 1700000000000,
      },
    ];

    mockJsonFetch((url, init) => {
      if (url.endsWith('/api/outbound/suppressions') && (!init?.method || init.method === 'GET')) {
        return { status: 200, body: { success: true, suppressions: entries } };
      }
      if (
        url.endsWith('/api/outbound/suppressions/info%2B122212%40armtek.org') &&
        init?.method === 'DELETE'
      ) {
        entries = [];
        return { status: 200, body: { success: true } };
      }
      return { status: 404, body: { success: false } };
    });

    render(
      <MemoryRouter initialEntries={['/suppressions?email=info%2B122212%40armtek.org']}>
        <MailDuckThemeProvider>
          <Suppressions />
        </MailDuckThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('info+122212@armtek.org')).toBeInTheDocument();
    expect(screen.getByText('550 5.0.0 550 Unrouteable address')).toBeInTheDocument();
    const listItem = screen.getByRole('listitem');
    expect(listItem).toHaveAttribute('data-highlighted', 'true');

    await user.click(screen.getByRole('button', { name: /remove info\+122212@armtek\.org/i }));

    await waitFor(() => {
      expect(screen.queryByText('info+122212@armtek.org')).not.toBeInTheDocument();
    });
  });
});
