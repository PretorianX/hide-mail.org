import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MailDuckThemeProvider } from '@/design-system';
import { Metrics } from '@/pages/Metrics/Metrics';
import { mockJsonFetch } from '@/test/mockFetch';

describe('Metrics', () => {
  beforeEach(() => {
    localStorage.setItem('hm_outbound_license', 'HM-AAAA-BBBB-CCCC-DDDD');
    jest.restoreAllMocks();
  });

  it('reveals token once and shows scrape_config for hide-mail.org', async () => {
    const user = userEvent.setup();
    mockJsonFetch((_url, init) => {
      if (init?.method === 'POST') {
        return {
          status: 201,
          body: {
            success: true,
            key: 'hm_metrics_secretvalue123',
            createdAt: Date.now(),
            scrapeConfig: {
              job_name: 'hidemail-outbound',
              metrics_path: '/api/outbound/metrics',
              scheme: 'https',
              static_configs: [{ targets: ['hide-mail.org'] }],
              authorization: { type: 'Bearer', credentials: 'hm_metrics_secretvalue123' },
            },
          },
        };
      }
      return { status: 404, body: { success: false, code: 'NOT_FOUND' } };
    });

    render(
      <MailDuckThemeProvider>
        <Metrics />
      </MailDuckThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Create token|Rotate token/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Create token|Rotate token/i }));

    await waitFor(() => {
      expect(screen.getByText('hm_metrics_secretvalue123')).toBeInTheDocument();
    });
    const scrape = screen.getByTestId('scrape-config');
    expect(scrape.textContent).toContain('hide-mail.org');
    expect(scrape.textContent).not.toContain('send.hide-mail.org');
    expect(scrape.textContent).toContain('/api/outbound/metrics');
    expect(scrape.textContent).toContain('hm_metrics_secretvalue123');
  });
});

