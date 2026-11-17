import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MailDuckThemeProvider } from '@/design-system';
import { OpsKeys } from './OpsKeys';
import { listAdminLicenses, listLicenseTypes } from '@/api/admin';

jest.mock('@/api/admin', () => ({
  listAdminLicenses: jest.fn(),
  listLicenseTypes: jest.fn(),
  createAdminLicense: jest.fn(),
  deleteAdminLicense: jest.fn(),
  adminLogout: jest.fn(),
}));

const licenses = [
  {
    id: 'id-outbound',
    maskedKey: '****ZQLL',
    type: 'outbound',
    status: 'active',
    label: 'ecabinet.tax',
    plan: null,
    accountId: 'acct-ecabinet',
    createdAt: 1_700_000_000_000,
    expiresAt: 1_700_086_400_000,
    remainingDays: 365,
    ratePerMinute: 600,
    dailyLimitDefault: null,
  },
  {
    id: 'id-suite',
    maskedKey: '****J237',
    type: 'suite',
    status: 'active',
    label: 'qa-bot',
    plan: 'monthly',
    accountId: null,
    createdAt: 1_700_000_100_000,
    expiresAt: 1_700_086_500_000,
    remainingDays: 30,
    ratePerMinute: null,
    dailyLimitDefault: null,
  },
];

function renderPage() {
  return render(
    <MailDuckThemeProvider>
      <MemoryRouter>
        <OpsKeys />
      </MemoryRouter>
    </MailDuckThemeProvider>,
  );
}

describe('OpsKeys', () => {
  beforeEach(() => {
    jest.mocked(listAdminLicenses).mockResolvedValue(licenses);
    jest.mocked(listLicenseTypes).mockResolvedValue(['outbound', 'suite', 'api']);
  });

  it('lists masked licences in a detail table and never shows a full HM key from the list', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('****ZQLL')).toBeInTheDocument();
    });
    expect(screen.getByText('****J237')).toBeInTheDocument();
    expect(screen.getByText('ecabinet.tax')).toBeInTheDocument();
    expect(screen.getByText('acct-ecabinet')).toBeInTheDocument();
    expect(screen.getByText(/600\/min/)).toBeInTheDocument();
    expect(screen.getAllByText(/unlimited/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/HM-AAAA-BBBB-CCCC-DDDD/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/ADMIN_EMAIL|ADMIN_PASSWORD|\.env/i);
  });

  it('shows summary counts and filters by search', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('****ZQLL')).toBeInTheDocument();
    });

    expect(screen.getByTestId('ops-summary')).toHaveTextContent(/2 licences/i);
    expect(screen.getByTestId('ops-summary')).toHaveTextContent(/2 active/i);

    await user.type(screen.getByRole('searchbox', { name: /search licences/i }), 'qa-bot');
    expect(screen.queryByText('****ZQLL')).not.toBeInTheDocument();
    expect(screen.getByText('****J237')).toBeInTheDocument();
  });

  it('opens a detail drawer with full licence fields on row click', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('****ZQLL')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('row', { name: /ZQLL/i }));
    const drawer = await screen.findByRole('dialog', { name: /licence detail/i });
    expect(within(drawer).getByText('****ZQLL')).toBeInTheDocument();
    expect(within(drawer).getByText('acct-ecabinet')).toBeInTheDocument();
    expect(within(drawer).getByText('ecabinet.tax')).toBeInTheDocument();
    expect(within(drawer).getByText(/600/)).toBeInTheDocument();
  });
});
