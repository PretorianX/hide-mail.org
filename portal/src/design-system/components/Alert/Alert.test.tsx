import { render, screen } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../../theme/theme';
import { Alert } from './Alert';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

describe('Alert', () => {
  it('renders children', () => {
    renderWithTheme(<Alert variant="error">Something went wrong</Alert>);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('has role="alert"', () => {
    renderWithTheme(<Alert variant="info">Notice</Alert>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders each variant', () => {
    const { rerender } = renderWithTheme(
      <Alert variant="error">Error</Alert>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    rerender(
      <ThemeProvider theme={lightTheme}>
        <Alert variant="success">Success</Alert>
      </ThemeProvider>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    rerender(
      <ThemeProvider theme={lightTheme}>
        <Alert variant="warning">Warning</Alert>
      </ThemeProvider>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    rerender(
      <ThemeProvider theme={lightTheme}>
        <Alert variant="info">Info</Alert>
      </ThemeProvider>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
