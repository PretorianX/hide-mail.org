import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { MailDuckThemeProvider } from '@/design-system';
import { RequireAuth } from '@/auth/RequireAuth';

describe('RequireAuth', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('redirects to unlock when no licence is stored', () => {
    render(
      <MailDuckThemeProvider>
        <MemoryRouter initialEntries={['/domains']}>
          <Routes>
            <Route element={<RequireAuth />}>
              <Route path="/domains" element={<div>Domains secret</div>} />
            </Route>
            <Route path="/unlock" element={<div>Unlock page</div>} />
          </Routes>
        </MemoryRouter>
      </MailDuckThemeProvider>,
    );

    expect(screen.getByText('Unlock page')).toBeInTheDocument();
    expect(screen.queryByText('Domains secret')).not.toBeInTheDocument();
  });
});
