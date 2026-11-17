import { render, screen } from '@testing-library/react';
import { MailDuckThemeProvider, Button } from '@/design-system';

describe('design-system copy', () => {
  it('exposes ThemeProvider and Button from version 0.1.2', () => {
    render(
      <MailDuckThemeProvider>
        <Button>Send</Button>
      </MailDuckThemeProvider>,
    );
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });
});
