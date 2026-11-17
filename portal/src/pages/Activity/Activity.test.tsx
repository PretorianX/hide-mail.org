import { render, screen, waitFor } from '@testing-library/react';
import { MailDuckThemeProvider } from '@/design-system';
import { Activity } from '@/pages/Activity/Activity';
import { mockJsonFetch } from '@/test/mockFetch';

describe('Activity', () => {
  beforeEach(() => {
    localStorage.setItem('hm_outbound_license', 'HM-AAAA-BBBB-CCCC-DDDD');
    jest.restoreAllMocks();
  });

  it('renders bounced status and last response for late bounce', async () => {
    mockJsonFetch(() => ({
      status: 200,
      body: {
        success: true,
        messages: [
          {
            id: 'm1',
            accountId: 'a1',
            domain: 'mail.example.com',
            recipient: 'gone@example.org',
            reference: null,
            status: 'bounced',
            createdAt: 1,
            lastEventAt: 2,
            lastResponse: '550 5.1.1 user unknown',
          },
        ],
      },
    }));

    render(
      <MailDuckThemeProvider>
        <Activity />
      </MailDuckThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('bounced')).toBeInTheDocument();
    });
    expect(screen.getByText(/5\.1\.1/)).toBeInTheDocument();
  });
});
