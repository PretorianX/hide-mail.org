import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { MailDuckThemeProvider } from '@/design-system';
import { DomainDetail } from '@/pages/Domains/DomainDetail';
import { mockJsonFetch } from '@/test/mockFetch';

describe('DomainDetail DNS check', () => {
  beforeEach(() => {
    localStorage.setItem('hm_outbound_license', 'HM-AAAA-BBBB-CCCC-DDDD');
    jest.restoreAllMocks();
  });

  it('shows fail status and reason, then updates after Check DNS', async () => {
    const user = userEvent.setup();
    mockJsonFetch((url) => {
      if (url.includes('/check') && url.includes('mail.example.com')) {
        return {
          status: 200,
          body: {
            success: true,
            domain: 'mail.example.com',
            state: 'verified',
            records: [
              {
                id: 'returnPath',
                type: 'CNAME',
                host: 'hm-bounce.mail.example.com',
                value: 'rp.hide-mail.org',
                status: 'pass',
                reason: null,
                nameserverAnswers: [],
              },
            ],
          },
        };
      }
      return {
        status: 200,
        body: {
          success: true,
          domains: [
            {
              domain: 'mail.example.com',
              state: 'pending',
              suspended: false,
              dailyLimit: 5000,
              records: [
                {
                  id: 'returnPath',
                  type: 'CNAME',
                  host: 'hm-bounce.mail.example.com',
                  expected: 'rp.hide-mail.org',
                  status: 'fail',
                  reason: 'missing',
                  nameserverAnswers: [
                    { nameserver: 'ns1.example.net', value: [], matched: false },
                  ],
                },
              ],
            },
          ],
        },
      };
    });

    render(
      <MailDuckThemeProvider>
        <MemoryRouter initialEntries={['/domains/mail.example.com']}>
          <Routes>
            <Route path="/domains/:domain" element={<DomainDetail />} />
          </Routes>
        </MemoryRouter>
      </MailDuckThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/missing/i)).toBeInTheDocument();
    });
    expect(screen.getByText('Pending')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Check DNS' }));

    await waitFor(() => {
      expect(screen.getByText('Verified')).toBeInTheDocument();
    });
  });
});
