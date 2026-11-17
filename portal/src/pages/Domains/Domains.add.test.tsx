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
      type: 'CNAME',
      host: 'hm-bounce.mail.example.com',
      value: 'rp.hide-mail.org',
      expected: 'rp.hide-mail.org',
      status: 'fail',
      reason: 'missing',
    },
    {
      id: 'dmarc',
      type: 'TXT',
      host: '_dmarc.mail.example.com',
      value: null,
      expected: null,
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

    expect(screen.getAllByText('TXT').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(DKIM_HOST)).toBeInTheDocument();
    expect(screen.getByText(DKIM_VALUE)).toBeInTheDocument();
    expect(screen.getByText('CNAME')).toBeInTheDocument();
    expect(screen.getByText('hm-bounce.mail.example.com')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check DNS' })).toBeInTheDocument();
  });
});
