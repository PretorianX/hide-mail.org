import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, screen, waitFor, fireEvent, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import Pro from './Pro';
import { LicenseProvider } from '../context/LicenseContext';
import LicenseService from '../services/LicenseService';

const renderPro = () =>
  render(
    <MemoryRouter>
      <LicenseProvider>
        <Pro />
      </LicenseProvider>
    </MemoryRouter>
  );

const mockPaidReturn = () => {
  window.history.replaceState({}, '', '/pro?handoffToken=token-abc');
  LicenseService.fetchPaidOrder.mockResolvedValue({
    licenseKey: 'HM-AAAA-BBBB-CCCC-DDDD',
  });
  LicenseService.restore.mockResolvedValue({
    license: {
      key: 'HM-AAAA-BBBB-CCCC-DDDD',
      active: true,
      type: 'pro',
      remainingDays: 30,
    },
    entitlements: { ads: false },
  });
};

if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
}

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
    window.history.replaceState({}, '', '/pro');
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
    Object.assign(navigator, {
      clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
    });
    sessionStorage.clear();
  });

  test('offers a PayPal order instead of card checkout and shows the plan comparison', async () => {
    renderPro();

    expect(await screen.findByTestId('paypal-donate')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /yearly/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /monthly/i })).not.toBeInTheDocument();
    expect(await screen.findByTestId('plan-comparison')).toBeInTheDocument();
    expect(screen.getByText(/card checkout is paused/i)).toBeInTheDocument();
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

  test('opens a success dialog with the license key and remaining days after payment', async () => {
    mockPaidReturn();
    renderPro();

    const dialog = await screen.findByRole('dialog', { name: /payment successful/i });
    expect(within(dialog).getByText('HM-AAAA-BBBB-CCCC-DDDD')).toBeInTheDocument();
    expect(within(dialog).getByText(/30 days/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: /go to your inbox/i })).toHaveAttribute('href', '/');
  });

  test('copies the license key to the clipboard when payment succeeds', async () => {
    mockPaidReturn();
    renderPro();

    await screen.findByRole('dialog', { name: /payment successful/i });
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('HM-AAAA-BBBB-CCCC-DDDD');
    });
  });

  test('lets the visitor copy the license key from the success dialog', async () => {
    mockPaidReturn();
    renderPro();

    const dialog = await screen.findByRole('dialog', { name: /payment successful/i });
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });
    navigator.clipboard.writeText.mockClear();

    fireEvent.click(within(dialog).getByRole('button', { name: /copy license key/i }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('HM-AAAA-BBBB-CCCC-DDDD');
    });
    expect(within(dialog).getByText(/copied/i)).toBeInTheDocument();
  });

  test('does not open a payment success dialog for an already-active license', async () => {
    LicenseService.restoreSaved.mockResolvedValue({
      license: {
        key: 'HM-AAAA-BBBB-CCCC-DDDD',
        active: true,
        type: 'pro',
        remainingDays: 12,
        expiresAt: Date.now() + 12 * 24 * 60 * 60 * 1000,
      },
      entitlements: { ads: false },
    });

    renderPro();

    const card = await screen.findByTestId('pro-active');
    expect(within(card).getByText('Pro is active')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /payment successful/i })).not.toBeInTheDocument();
  });

  test('lets the visitor copy the saved license key from the active plan card', async () => {
    LicenseService.restoreSaved.mockResolvedValue({
      license: {
        key: 'HM-AAAA-BBBB-CCCC-DDDD',
        active: true,
        type: 'pro',
        remainingDays: 12,
        expiresAt: Date.now() + 12 * 24 * 60 * 60 * 1000,
      },
      entitlements: { ads: false },
    });

    renderPro();

    const card = await screen.findByTestId('pro-active');
    fireEvent.click(within(card).getByRole('button', { name: /copy license key/i }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('HM-AAAA-BBBB-CCCC-DDDD');
    });
  });

  test('collects the license key when the return URL uses a snake_case handoff token', async () => {
    window.history.replaceState({}, '', '/pro?handoff_token=token-abc');
    LicenseService.fetchPaidOrder.mockResolvedValue({
      licenseKey: 'HM-AAAA-BBBB-CCCC-DDDD',
    });
    LicenseService.restore.mockResolvedValue({
      license: {
        key: 'HM-AAAA-BBBB-CCCC-DDDD',
        active: true,
        type: 'pro',
        remainingDays: 30,
      },
      entitlements: { ads: false },
    });

    renderPro();

    await screen.findByRole('dialog', { name: /payment successful/i });
    expect(LicenseService.fetchPaidOrder).toHaveBeenCalledWith('token-abc');
  });

  test('retries the handoff until WayForPay has marked the order paid', async () => {
    window.history.replaceState({}, '', '/pro?handoffToken=token-abc');
    LicenseService.fetchPaidOrder
      .mockResolvedValueOnce({ licenseKey: null, data: { paidAt: null } })
      .mockResolvedValueOnce({ licenseKey: 'HM-AAAA-BBBB-CCCC-DDDD' });
    LicenseService.restore.mockResolvedValue({
      license: {
        key: 'HM-AAAA-BBBB-CCCC-DDDD',
        active: true,
        type: 'pro',
        remainingDays: 30,
      },
      entitlements: { ads: false },
    });

    renderPro();

    expect(await screen.findByText(/confirming payment/i)).toBeInTheDocument();
    await screen.findByRole('dialog', { name: /payment successful/i }, { timeout: 4000 });
    expect(LicenseService.fetchPaidOrder).toHaveBeenCalledTimes(2);
  });

  test('hides the shop while payment is confirming', async () => {
    window.history.replaceState({}, '', '/pro?handoffToken=token-abc');
    LicenseService.fetchPaidOrder.mockImplementation(() => new Promise(() => {}));

    renderPro();

    expect(await screen.findByText(/confirming payment/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/paste your key/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('paypal-donate')).not.toBeInTheDocument();
  });

  test('collects a handoff token kept in session after the URL was stripped', async () => {
    window.history.replaceState({}, '', '/pro');
    sessionStorage.setItem('hidemail_handoff_token', 'token-abc');
    LicenseService.fetchPaidOrder.mockResolvedValue({
      licenseKey: 'HM-AAAA-BBBB-CCCC-DDDD',
    });
    LicenseService.restore.mockResolvedValue({
      license: {
        key: 'HM-AAAA-BBBB-CCCC-DDDD',
        active: true,
        type: 'pro',
        remainingDays: 30,
      },
      entitlements: { ads: false },
    });

    renderPro();

    await screen.findByRole('dialog', { name: /payment successful/i });
    expect(LicenseService.fetchPaidOrder).toHaveBeenCalledWith('token-abc');
  });

  test('renders the Connect via MCP configuration snippet', async () => {
    renderPro();

    const snippet = await screen.findByTestId('mcp-config-snippet');
    expect(snippet).toHaveTextContent('"mcpServers"');
    expect(snippet).toHaveTextContent('https://hide-mail.org/api/mcp');
    expect(snippet).toHaveTextContent('"X-API-Key": "hm_live_..."');
  });

  test('collects a handoff token from the URL fragment and strips it immediately', async () => {
    window.history.replaceState({}, '', '/pro#handoffToken=token-frag');
    LicenseService.fetchPaidOrder.mockResolvedValue({
      licenseKey: 'HM-AAAA-BBBB-CCCC-DDDD',
    });
    LicenseService.restore.mockResolvedValue({
      license: {
        key: 'HM-AAAA-BBBB-CCCC-DDDD',
        active: true,
        type: 'pro',
        remainingDays: 30,
      },
      entitlements: { ads: false },
    });

    renderPro();

    await screen.findByRole('dialog', { name: /payment successful/i });
    expect(LicenseService.fetchPaidOrder).toHaveBeenCalledWith('token-frag');
    expect(window.location.href).not.toContain('token-frag');
    expect(window.location.hash).toBe('');
  });

  test('never restores handoffToken into the URL when activation fails', async () => {
    window.history.replaceState({}, '', '/pro#handoffToken=token-err');
    LicenseService.fetchPaidOrder.mockResolvedValue({
      licenseKey: 'HM-AAAA-BBBB-CCCC-DDDD',
    });
    LicenseService.restore.mockRejectedValue(new Error('Activation failed'));

    renderPro();

    expect(await screen.findByText(/activation failed/i)).toBeInTheDocument();
    expect(window.location.href).not.toContain('handoffToken');
    expect(window.location.href).not.toContain('token-err');
  });

  test('never restores handoffToken into the URL when payment polling times out', async () => {
    jest.useFakeTimers();
    try {
      window.history.replaceState({}, '', '/pro#handoffToken=token-pending');
      LicenseService.fetchPaidOrder.mockResolvedValue({ licenseKey: null });

      renderPro();
      expect(await screen.findByText(/confirming payment/i)).toBeInTheDocument();

      for (let i = 0; i < 18; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await act(async () => {
          jest.advanceTimersByTime(1100);
          await Promise.resolve();
          await Promise.resolve();
        });
      }

      jest.useRealTimers();
      expect(await screen.findByText(/payment is still confirming/i)).toBeInTheDocument();
      expect(window.location.href).not.toContain('handoffToken');
      expect(window.location.href).not.toContain('token-pending');
      expect(sessionStorage.getItem('hidemail_handoff_token')).toBe('token-pending');
    } finally {
      jest.useRealTimers();
    }
  });

  test('public/index.html strips handoffToken synchronously as the first head element before third-party scripts', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../../public/index.html'), 'utf8');
    const headMatch = html.match(/<head>([\s\S]*?)<\/head>/i);
    expect(headMatch).toBeTruthy();
    const headInner = headMatch[1].trim();
    expect(headInner.startsWith('<script>')).toBe(true);

    const firstScriptMatch = headInner.match(/^<script>([\s\S]*?)<\/script>/i);
    expect(firstScriptMatch).toBeTruthy();
    const inlineCode = firstScriptMatch[1];

    const gtagPos = headInner.indexOf('googletagmanager.com/gtag/js');
    expect(gtagPos).toBeGreaterThan(firstScriptMatch[0].length);

    // Execute the inline head script against both fragment and query handoff URLs
    window.history.replaceState({}, '', '/pro#handoffToken=secret-frag-123');
    // eslint-disable-next-line no-new-func
    new Function(inlineCode)();
    expect(document.location.href).not.toContain('secret-frag-123');
    expect(document.location.href).not.toContain('handoffToken');
    expect(sessionStorage.getItem('hidemail_handoff_token')).toBe('secret-frag-123');

    sessionStorage.clear();
    window.history.replaceState({}, '', '/pro?handoffToken=secret-query-456');
    // eslint-disable-next-line no-new-func
    new Function(inlineCode)();
    expect(document.location.href).not.toContain('secret-query-456');
    expect(document.location.href).not.toContain('handoffToken');
    expect(sessionStorage.getItem('hidemail_handoff_token')).toBe('secret-query-456');
  });
});
