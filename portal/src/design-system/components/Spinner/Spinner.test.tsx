import { render, screen } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../../theme/theme';
import { Spinner } from './Spinner';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

describe('Spinner', () => {
  it('renders with role="status"', () => {
    renderWithTheme(<Spinner />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('has default accessible name "Loading"', () => {
    renderWithTheme(<Spinner />);
    expect(screen.getByRole('status')).toHaveAccessibleName('Loading');
  });

  it('shows label text when provided', () => {
    renderWithTheme(<Spinner label="Fetching emails…" />);
    expect(screen.getByText('Fetching emails…')).toBeInTheDocument();
  });

  it('uses label as accessible name when provided', () => {
    renderWithTheme(<Spinner label="Please wait" />);
    expect(screen.getByRole('status')).toHaveAccessibleName('Please wait');
  });

  it('includes visually hidden "Loading" text', () => {
    renderWithTheme(<Spinner />);
    expect(screen.getByText('Loading')).toBeInTheDocument();
  });
});
