import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MailDuckThemeProvider } from '@/design-system';
import { OpsKeys } from './OpsKeys';

jest.mock('@/api/admin', () => ({
  listAdminLicenses: jest.fn().mockResolvedValue([
    {
      id: 'HM-AAAA-BBBB-CCCC-DDDD',
      maskedKey: '****DDDD',
      type: 'outbound',
      status: 'active',
      label: 'acme',
      plan: null,
      accountId: 'acct-1',
      createdAt: Date.now(),
      expiresAt: Date.now() + 86400000,
      remainingDays: 1,
      ratePerMinute: 120,
      dailyLimitDefault: 500,
    },
  ]),
  listLicenseTypes: jest.fn().mockResolvedValue(['outbound', 'suite', 'api']),
  createAdminLicense: jest.fn(),
  deleteAdminLicense: jest.fn(),
  adminLogout: jest.fn(),
}));

describe('OpsKeys', () => {
  it('lists masked licences and never shows a full HM key from the list payload', async () => {
    render(
      <MailDuckThemeProvider>
        <MemoryRouter>
          <OpsKeys />
        </MemoryRouter>
      </MailDuckThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('****DDDD')).toBeInTheDocument();
    });
    expect(screen.queryByText(/HM-AAAA-BBBB-CCCC-DDDD/)).not.toBeInTheDocument();
    expect(screen.getByText(/120\/min/)).toBeInTheDocument();
  });
});
