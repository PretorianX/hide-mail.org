import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MailDuckThemeProvider } from '@/design-system';
import { OpsKeys } from './OpsKeys';
import { createAdminLicense, listAdminLicenses, listLicenseTypes } from '@/api/admin';

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
    jest.mocked(listLicenseTypes).mockResolvedValue([
      'outbound',
      'suite',
      'api',
      'grade',
      'pro',
    ]);
    jest.mocked(createAdminLicense).mockReset();
  });

  it('lists masked licences and never shows a full HM key from the list', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('****ZQLL')).toBeInTheDocument();
    });
    expect(screen.getByText('ecabinet.tax')).toBeInTheDocument();
    expect(screen.queryByText(/HM-AAAA-BBBB-CCCC-DDDD/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/ADMIN_EMAIL|ADMIN_PASSWORD|\.env/i);
  });

  it('one-click generates a QA api key with the operator-chosen duration', async () => {
    const user = userEvent.setup();
    jest.mocked(createAdminLicense).mockResolvedValue({
      id: 'new-qa',
      maskedKey: '****QA01',
      type: 'api',
      status: 'active',
      label: 'ci',
      plan: 'monthly',
      accountId: null,
      createdAt: Date.now(),
      expiresAt: Date.now() + 86400000,
      remainingDays: 45,
      ratePerMinute: null,
      key: 'HM-NEW1-NEW2-NEW3-NEW4',
      apiKey: 'hm_api_qa_test_secret',
    });
    jest.mocked(listAdminLicenses).mockResolvedValueOnce(licenses).mockResolvedValue([
      ...licenses,
      {
        id: 'new-qa',
        maskedKey: '****QA01',
        type: 'api',
        status: 'active',
        label: 'ci',
        plan: 'monthly',
        accountId: null,
        createdAt: Date.now(),
        expiresAt: Date.now() + 86400000,
        remainingDays: 45,
        ratePerMinute: null,
      },
    ]);

    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /QA Mailboxes/i })).toBeInTheDocument();
    });

    const daysInput = screen.getByLabelText(/validity days/i);
    await user.clear(daysInput);
    await user.type(daysInput, '45');
    await user.type(screen.getByLabelText(/^label$/i), 'ci');
    await user.click(screen.getByRole('button', { name: /QA Mailboxes/i }));

    await waitFor(() => {
      expect(createAdminLicense).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'api', days: 45, label: 'ci' }),
      );
    });
    expect(await screen.findByText(/hm_api_qa_test_secret/)).toBeInTheDocument();
    expect(screen.getByText(/Copy this key now/i)).toBeInTheDocument();
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
  });
});
