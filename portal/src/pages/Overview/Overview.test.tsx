import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MailDuckThemeProvider } from '@/design-system';
import { Overview } from '@/pages/Overview/Overview';
import { mockJsonFetch } from '@/test/mockFetch';

describe('Overview', () => {
  beforeEach(() => {
    localStorage.setItem('hm_outbound_license', 'HM-AAAA-BBBB-CCCC-DDDD');
    jest.restoreAllMocks();
  });

  it('shows No daily cap and Rate limit label', async () => {
    mockJsonFetch(() => ({
      status: 200,
      body: {
        success: true,
        ratePerMinute: 600,
        domains: [
          {
            domain: 'mail.example.com',
            state: 'verified',
            suspended: false,
            dailyLimit: null,
            sentToday: 12,
            delivered: 10,
            deferred: 1,
            bounced: 0,
            delivered24h: 3,
            deferred24h: 0,
            bounced24h: 0,
            delivered7d: 10,
            deferred7d: 1,
            bounced7d: 0,
          },
        ],
      },
    }));

    render(
      <MailDuckThemeProvider>
        <MemoryRouter>
          <Overview />
        </MemoryRouter>
      </MailDuckThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/No daily cap/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Rate limit: 600 per minute/)).toBeInTheDocument();
  });
});
