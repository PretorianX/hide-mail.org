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
    localStorage.clear();
    LicenseService.listPlans.mockResolvedValue({
      success: true,
      settlementCurrency: 'UAH',
      defaultDisplayCurrency: 'USD',
      usdRate: 41.5,
      rates: { USD: 41.5, EUR: 45.2, GBP: 52.1 },
      plans: [
        { id: 'monthly', type: 'pro', plan: 'monthly', amount: 140, usd: 3.49 },
        { id: 'yearly', type: 'pro', plan: 'yearly', amount: 1030, usd: 24.99 },
        { id: 'api', type: 'api', plan: 'monthly', amount: 330, usd: 7.99 },
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
      expect(screen.getByText(/1030/)).toBeInTheDocument();
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
    expect(screen.getByText('$3.49 per month (140 UAH)')).toBeInTheDocument();
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

    const apiPlan = await screen.findByRole('button', { name: /api for qa/i });
    fireEvent.click(apiPlan);

    await waitFor(() => {
      expect(LicenseService.checkout).toHaveBeenCalledWith('monthly', 'api', 'USD');
    });
  });

  test('removes the handoff token from the URL after collecting the license key', async () => {
    window.history.replaceState({}, '', '/pro?handoffToken=token-abc');
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
      expect(LicenseService.fetchPaidOrder).toHaveBeenCalledWith('token-abc');
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

    expect(await screen.findByText('$3.49')).toBeInTheDocument();
    expect(screen.getByText('charged as 140 UAH')).toBeInTheDocument();
    expect(screen.getByText('$3.49 per month (140 UAH)')).toBeInTheDocument();
  });

  test('lets the visitor pick a display currency and sends it at checkout', async () => {
    render(
      <MemoryRouter>
        <LicenseProvider>
          <Pro />
        </LicenseProvider>
      </MemoryRouter>
    );

    const picker = await screen.findByLabelText(/display currency/i);
    fireEvent.change(picker, { target: { value: 'EUR' } });
    expect(screen.getByText('3.20 EUR')).toBeInTheDocument();
    expect(localStorage.getItem('hidemail.displayCurrency')).toBe('EUR');

    fireEvent.click(screen.getByRole('button', { name: /api for qa/i }));
    await waitFor(() => {
      expect(LicenseService.checkout).toHaveBeenCalledWith('monthly', 'api', 'EUR');
    });
  });

  test('shows a rates error and does not offer checkout', async () => {
    LicenseService.listPlans.mockRejectedValue(new Error('Currency rates are unavailable. Try again later.'));

    render(
      <MemoryRouter>
        <LicenseProvider>
          <Pro />
        </LicenseProvider>
      </MemoryRouter>
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/currency rates are unavailable/i);
    expect(screen.queryByRole('button', { name: /monthly/i })).not.toBeInTheDocument();
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
