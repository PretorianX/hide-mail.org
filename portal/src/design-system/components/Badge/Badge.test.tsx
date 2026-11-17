import { render, screen } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../../theme/theme';
import { Badge } from './Badge';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

describe('Badge', () => {
  it('renders children text', () => {
    renderWithTheme(<Badge>5</Badge>);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders with default variant', () => {
    renderWithTheme(<Badge variant="default">3</Badge>);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders with accent variant', () => {
    renderWithTheme(<Badge variant="accent">12</Badge>);
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('renders with error variant', () => {
    renderWithTheme(<Badge variant="error">!</Badge>);
    expect(screen.getByText('!')).toBeInTheDocument();
  });

  it('renders with success variant', () => {
    renderWithTheme(<Badge variant="success">✓</Badge>);
    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  it('renders with each size', () => {
    const { rerender } = renderWithTheme(<Badge size="sm">1</Badge>);
    expect(screen.getByText('1')).toBeInTheDocument();

    rerender(
      <ThemeProvider theme={lightTheme}>
        <Badge size="md">1</Badge>
      </ThemeProvider>,
    );
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('uses a subtle orange accent treatment', () => {
    renderWithTheme(<Badge variant="accent">New</Badge>);

    expect(screen.getByText('New')).toHaveStyleRule(
      'background',
      lightTheme.colors.primaryLight,
    );
    expect(screen.getByText('New')).toHaveStyleRule(
      'color',
      lightTheme.colors.primaryDark,
    );
  });
});
