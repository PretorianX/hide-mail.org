import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Pro from './Pro';
import { LicenseProvider } from '../context/LicenseContext';
import LicenseService from '../services/LicenseService';

jest.mock('../services/LicenseService', () => ({
  listPlans: jest.fn(),
  restoreSaved: jest.fn(),
  checkout: jest.fn(),
  fetchPaidOrder: jest.fn(),
  restore: jest.fn(),
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
        { id: 'monthly', amount: 149, usdDisplay: '4.99' },
        { id: 'yearly', amount: 1079, usdDisplay: '36' },
      ],
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
    expect(screen.getByText(/no account/i)).toBeInTheDocument();
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
