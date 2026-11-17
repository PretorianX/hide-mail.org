import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { MailDuckThemeProvider } from '@/design-system';
import { Domains } from '@/pages/Domains/Domains';
import { DomainDetail } from '@/pages/Domains/DomainDetail';
import { mockJsonFetch } from '@/test/mockFetch';

const DKIM_HOST = 'hm-a1b2._domainkey.mail.example.com';
const DKIM_VALUE =
  'v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0TESTKEY';

const createdPayload = {
  success: true,
  domain: 'mail.example.com',
  selector: 'hm-a1b2',
  state: 'pending',
  records: [
    {
      id: 'dkim',
      type: 'TXT',
      host: DKIM_HOST,
      value: DKIM_VALUE,
      expected: DKIM_VALUE,
      status: 'fail',
      reason: 'missing',
    },
    {
      id: 'returnPath',
      purpose: 'Bounce / Return-Path',
      type: 'CNAME',
      host: 'hm-bounce.mail.example.com',
      value: 'rp.hide-mail.org',
      expected: 'rp.hide-mail.org',
      status: 'fail',
      reason: 'missing',
    },
    {
      id: 'spf',
      purpose: 'SPF (authorize Hide Mail)',
      type: 'TXT',
      host: 'mail.example.com',
      value: 'v=spf1 include:_spf.hide-mail.org ~all',
      expected: 'v=spf1 include:_spf.hide-mail.org ~all',
      status: 'fail',
      reason: 'missing',
    },
    {
      id: 'dmarc',
      purpose: 'DMARC policy',
      type: 'TXT',
      host: '_dmarc.mail.example.com',
      value: 'v=DMARC1; p=none;',
      expected: 'v=DMARC1; p=none;',
      status: 'fail',
      reason: 'missing',
    },
  ],
};

describe('Domains add → DKIM records', () => {
  beforeEach(() => {
    localStorage.setItem('hm_outbound_license', 'HM-AAAA-BBBB-CCCC-DDDD');
    jest.restoreAllMocks();
  });

  it('adds a domain and shows the generated DKIM TXT on the detail page', async () => {
    const user = userEvent.setup();
    let domainsListed = false;

    mockJsonFetch((url, init) => {
      const path = new URL(url, 'http://localhost').pathname;
      const method = (init?.method || 'GET').toUpperCase();

      if (path === '/api/outbound/domains' && method === 'POST') {
        return { status: 201, body: createdPayload };
      }

      if (path === '/api/outbound/domains' && method === 'GET') {
        if (!domainsListed) {
          domainsListed = true;
          return { status: 200, body: { success: true, domains: [] } };
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
                dailyLimit: 1000,
                selector: 'hm-a1b2',
                records: createdPayload.records,
              },
            ],
          },
        };
      }

      return { status: 404, body: { success: false, error: `unhandled ${method} ${path}` } };
    });

    render(
      <MailDuckThemeProvider>
        <MemoryRouter initialEntries={['/domains']}>
          <Routes>
            <Route path="/domains" element={<Domains />} />
            <Route path="/domains/:domain" element={<DomainDetail />} />
          </Routes>
        </MemoryRouter>
      </MailDuckThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/No sending domains/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Domain name'), 'mail.example.com');
    await user.click(screen.getByRole('button', { name: 'Add domain' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'mail.example.com' })).toBeInTheDocument();
    });

    expect(screen.getByText(DKIM_HOST)).toBeInTheDocument();
    expect(screen.getByText(DKIM_VALUE)).toBeInTheDocument();
    expect(screen.getByText('hm-bounce.mail.example.com')).toBeInTheDocument();
    expect(screen.getAllByText('rp.hide-mail.org').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('v=spf1 include:_spf.hide-mail.org ~all').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('v=DMARC1; p=none;')).toBeInTheDocument();
    expect(screen.queryByText(/any valid v=DMARC1/i)).not.toBeInTheDocument();
    expect(screen.getByText(/rp means return-path/i)).toBeInTheDocument();
    expect(screen.getAllByText(/include:_spf\.hide-mail\.org/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /Copy host/i }).length).toBeGreaterThanOrEqual(4);
    expect(screen.getAllByRole('button', { name: /Copy value/i }).length).toBeGreaterThanOrEqual(4);

    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    await user.click(screen.getAllByRole('button', { name: /Copy value/i })[0]);
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(DKIM_VALUE);
    });

    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check DNS' })).toBeInTheDocument();
  });

  it('shows a readable message when Express returns a nested error object', async () => {
    const user = userEvent.setup();

    mockJsonFetch((url, init) => {
      const path = new URL(url, 'http://localhost').pathname;
      const method = (init?.method || 'GET').toUpperCase();

      if (path === '/api/outbound/domains' && method === 'GET') {
        return { status: 200, body: { success: true, domains: [] } };
      }

      if (path === '/api/outbound/domains' && method === 'POST') {
        return {
          status: 500,
          body: {
            error: {
              message: 'Internal Server Error',
              correlationId: 'abc-123',
            },
          },
        };
      }

      return { status: 404, body: { success: false, error: `unhandled ${method} ${path}` } };
    });

    render(
      <MailDuckThemeProvider>
        <MemoryRouter initialEntries={['/domains']}>
          <Routes>
            <Route path="/domains" element={<Domains />} />
          </Routes>
        </MemoryRouter>
      </MailDuckThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/No sending domains/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Domain name'), 'mail.example.com');
    await user.click(screen.getByRole('button', { name: 'Add domain' }));

    await waitFor(() => {
      expect(screen.getByText('Internal Server Error (abc-123)')).toBeInTheDocument();
    });
    expect(screen.queryByText(/\[object Object\]/i)).not.toBeInTheDocument();
  });
});
