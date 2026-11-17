import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MailDuckThemeProvider } from '@/design-system';
import { OpsLogin } from '@/pages/Ops/OpsLogin';

describe('OpsLogin', () => {
  it('does not reveal where operator credentials are configured', () => {
    render(
      <MailDuckThemeProvider>
        <MemoryRouter>
          <OpsLogin />
        </MemoryRouter>
      </MailDuckThemeProvider>,
    );

    expect(screen.getByRole('heading', { name: /operator admin/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/admin email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/admin password/i)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/ADMIN_EMAIL|ADMIN_PASSWORD|\.env/i);
  });
});
