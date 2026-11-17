import { render, screen } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../../theme/theme';
import { EmptyState } from './EmptyState';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

describe('EmptyState', () => {
  it('renders title', () => {
    renderWithTheme(<EmptyState title="No results found" />);
    expect(screen.getByText('No results found')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    renderWithTheme(
      <EmptyState
        title="No results"
        description="Try adjusting your search"
      />,
    );
    expect(screen.getByText('Try adjusting your search')).toBeInTheDocument();
  });

  it('renders icon when provided', () => {
    renderWithTheme(
      <EmptyState
        title="No results"
        icon={<span data-testid="icon">📭</span>}
      />,
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });
});
