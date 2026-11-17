import { render, screen } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../../theme/theme';
import { LoadingState } from './LoadingState';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

describe('LoadingState', () => {
  it('renders with default message', () => {
    renderWithTheme(<LoadingState />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders with custom message', () => {
    renderWithTheme(<LoadingState message="Fetching emails..." />);
    expect(screen.getByText('Fetching emails...')).toBeInTheDocument();
  });

  it('has role="status"', () => {
    renderWithTheme(<LoadingState />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
