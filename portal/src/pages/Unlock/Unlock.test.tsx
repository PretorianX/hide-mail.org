import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { MailDuckThemeProvider } from '@/design-system';
import { Unlock } from '@/pages/Unlock/Unlock';
import { getStoredLicense, STORAGE_KEY } from '@/auth/license';
import { mockJsonFetch } from '@/test/mockFetch';

function renderUnlock() {
  return render(
    <MailDuckThemeProvider>
      <MemoryRouter initialEntries={['/unlock']}>
        <Routes>
          <Route path="/unlock" element={<Unlock />} />
          <Route path="/overview" element={<div>Overview page</div>} />
        </Routes>
      </MemoryRouter>
    </MailDuckThemeProvider>,
  );
}

describe('Unlock', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    jest.restoreAllMocks();
  });

  it('does not store an invalid-format key', async () => {
    const user = userEvent.setup();
    renderUnlock();
    await user.type(screen.getByLabelText('Licence key'), 'not-a-key');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(getStoredLicense()).toBeNull();
    expect(screen.getByText(/HM-XXXX/i)).toBeInTheDocument();
  });

  it('stores a valid key after a successful probe and navigates', async () => {
    const user = userEvent.setup();
    mockJsonFetch(() => ({
      status: 200,
      body: { success: true, ratePerMinute: 600, domains: [] },
    }));

    renderUnlock();
    await user.type(screen.getByLabelText('Licence key'), 'HM-AAAA-BBBB-CCCC-DDDD');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));

    await waitFor(() => {
      expect(screen.getByText('Overview page')).toBeInTheDocument();
    });
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe('HM-AAAA-BBBB-CCCC-DDDD');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('does not keep a key rejected by the API', async () => {
    const user = userEvent.setup();
    mockJsonFetch(() => ({
      status: 403,
      body: { success: false, error: 'Not an outbound licence', code: 'FORBIDDEN' },
    }));

    renderUnlock();
    await user.type(screen.getByLabelText('Licence key'), 'HM-AAAA-BBBB-CCCC-DDDD');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));

    await waitFor(() => {
      expect(screen.getByText(/Not an outbound licence|Licence key rejected/i)).toBeInTheDocument();
    });
    expect(getStoredLicense()).toBeNull();
  });
});
