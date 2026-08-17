import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import Pro from './Pro';
import { LicenseProvider } from '../context/LicenseContext';
import LicenseService from '../services/LicenseService';

jest.mock('../services/LicenseService', () => ({
  listPlans: jest.fn(),
  restoreSaved: jest.fn(),
  checkout: jest.fn(),
  fetchPaidOrder: jest.fn(),
  restore: jest.fn(),
  requestApiKey: jest.fn(),
  submitWayforpayCheckout: jest.fn(),
}));

jest.mock('../components/DonateButton', () => {
  return function MockDonateButton() {
    return <div data-testid="paypal-donate">PayPal donate</div>;
  };
});

describe('Pro page', () => {
  beforeEach(() => {
    LicenseService.listPlans.mockResolvedValue({
      success: true,
      currency: 'UAH',
      plans: [
        { id: 'monthly', type: 'pro', plan: 'monthly', amount: 149, usdDisplay: '4.99' },
        { id: 'yearly', type: 'pro', plan: 'yearly', amount: 1079, usdDisplay: '36' },
        { id: 'api', type: 'api', plan: 'monthly', amount: 799, usdDisplay: '19' },
      ],
      tiers: {
        free: {
          ads: true,
          forwardingLimit: 2,
          mailboxTtlSeconds: 1800,
          mailboxTtlOptions: [],
        },
        pro: {
          ads: false,
          forwardingLimit: 100,
          mailboxTtlSeconds: 86400,
          mailboxTtlOptions: [86400, 604800, 2592000],
        },
        api: {
          ads: false,
          apiAccess: true,
          forwardingLimit: 100,
          mailboxTtlSeconds: 86400,
          mailboxTtlOptions: [86400, 604800, 2592000],
        },
        freeExtensionSeconds: 900,
        premiumDomainCount: 1,
        apiKeyTtlSeconds: 2592000,
      },
    });
    LicenseService.restoreSaved.mockResolvedValue(null);
    LicenseService.fetchPaidOrder.mockResolvedValue(null);
    LicenseService.restore.mockResolvedValue({
      license: { key: 'HM-AAAA-BBBB-CCCC-DDDD', active: true, type: 'pro' },
      entitlements: { ads: false },
    });
  });

  test('renders yearly as the featured checkout option', async () => {
    render(
      <MemoryRouter>
        <LicenseProvider>
          <Pro />
        </LicenseProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/1079/)).toBeInTheDocument();
    });
    expect(screen.getByText(/yearly/i)).toBeInTheDocument();
    expect(screen.getAllByText(/no account/i).length).toBeGreaterThan(0);
  });

  test('compares the free tier against the paid ones with real limits', async () => {
    render(
      <MemoryRouter>
        <LicenseProvider>
          <Pro />
        </LicenseProvider>
      </MemoryRouter>
    );

    expect(await screen.findByTestId('plan-comparison')).toBeInTheDocument();
    expect(screen.getByText('2 forwards per hour')).toBeInTheDocument();
    expect(screen.getByText('$4.99 per month (149 UAH)')).toBeInTheDocument();
  });

  test('shows remaining days for an active Pro license', async () => {
    const expiresAt = Date.now() + 12 * 24 * 60 * 60 * 1000;
    LicenseService.restoreSaved.mockResolvedValue({
      license: {
        key: 'HM-AAAA-BBBB-CCCC-DDDD',
        active: true,
        type: 'pro',
        expiresAt,
        remainingDays: 12,
      },
      entitlements: { ads: false },
    });

    render(
      <MemoryRouter>
        <LicenseProvider>
          <Pro />
        </LicenseProvider>
      </MemoryRouter>
    );

    expect(await screen.findByTestId('pro-days-left')).toHaveTextContent('12 days left');
  });

  test('checks out the API tariff with its own type and plan', async () => {
    render(
      <MemoryRouter>
        <LicenseProvider>
          <Pro />
        </LicenseProvider>
      </MemoryRouter>
    );

    const apiPlan = await screen.findByText(/api for qa/i);
    fireEvent.click(apiPlan.closest('button'));

    await waitFor(() => {
      expect(LicenseService.checkout).toHaveBeenCalledWith('monthly', 'api');
    });
  });

  test('removes the order reference from the URL after collecting the license key', async () => {
    window.history.replaceState({}, '', '/pro?orderReference=pro-monthly-abc');
    LicenseService.fetchPaidOrder.mockResolvedValue({
      licenseKey: 'HM-AAAA-BBBB-CCCC-DDDD',
    });

    render(
      <MemoryRouter>
        <LicenseProvider>
          <Pro />
        </LicenseProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(LicenseService.fetchPaidOrder).toHaveBeenCalledWith('pro-monthly-abc');
    });
    expect(window.location.search).toBe('');
  });

  test('quotes plans in dollars and names the hryvnia amount that is charged', async () => {
    render(
      <MemoryRouter>
        <LicenseProvider>
          <Pro />
        </LicenseProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText('$4.99')).toBeInTheDocument();
    expect(screen.getByText('charged as 149 UAH')).toBeInTheDocument();
    expect(screen.getByText('$4.99 per month (149 UAH)')).toBeInTheDocument();
  });

  test('lets an API subscriber pull a fresh key when the old one expires', async () => {
    LicenseService.restoreSaved.mockResolvedValue({
      license: {
        key: 'HM-AAAA-BBBB-CCCC-DDDD',
        active: true,
        type: 'api',
        expiresAt: Date.now() + 60 * 24 * 60 * 60 * 1000,
        remainingDays: 60,
      },
      entitlements: { ads: false, apiAccess: true },
    });
    LicenseService.requestApiKey.mockResolvedValue({
      success: true,
      apiKey: 'hm_api_fresh',
      remainingDays: 30,
    });

    render(
      <MemoryRouter>
        <LicenseProvider>
          <Pro />
        </LicenseProvider>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: /api key/i }));

    await waitFor(() => {
      expect(LicenseService.requestApiKey).toHaveBeenCalledWith('HM-AAAA-BBBB-CCCC-DDDD');
    });
    expect(await screen.findByTestId('pro-api-key')).toHaveTextContent('hm_api_fresh');
    expect(screen.getByText(/30 days left/)).toBeInTheDocument();
  });

  test('offers no API key button to a Pro license', async () => {
    LicenseService.restoreSaved.mockResolvedValue({
      license: {
        key: 'HM-AAAA-BBBB-CCCC-DDDD',
        active: true,
        type: 'pro',
        expiresAt: Date.now() + 12 * 24 * 60 * 60 * 1000,
        remainingDays: 12,
      },
      entitlements: { ads: false },
    });

    render(
      <MemoryRouter>
        <LicenseProvider>
          <Pro />
        </LicenseProvider>
      </MemoryRouter>
    );

    await screen.findByTestId('pro-active');
    expect(screen.queryByRole('button', { name: /api key/i })).not.toBeInTheDocument();
  });

  test('restores a pasted license key', async () => {
    render(
      <MemoryRouter>
        <LicenseProvider>
          <Pro />
        </LicenseProvider>
      </MemoryRouter>
    );

    const input = await screen.findByLabelText(/paste your key/i);
    fireEvent.change(input, { target: { value: 'HM-AAAA-BBBB-CCCC-DDDD' } });
    fireEvent.click(screen.getByRole('button', { name: /restore/i }));

    await waitFor(() => {
      expect(LicenseService.restore).toHaveBeenCalledWith('HM-AAAA-BBBB-CCCC-DDDD');
    });
  });
});
