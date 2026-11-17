import { render, screen } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../../theme/theme';
import { Card } from './Card';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

describe('Card', () => {
  it('renders children', () => {
    renderWithTheme(<Card>Card content</Card>);
    expect(screen.getByText('Card content')).toBeInTheDocument();
  });

  it('renders with default variant', () => {
    const { container } = renderWithTheme(
      <Card variant="default">Default</Card>,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders with elevated variant', () => {
    const { container } = renderWithTheme(
      <Card variant="elevated">Elevated</Card>,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('passes through HTML attributes', () => {
    renderWithTheme(<Card data-testid="my-card">Content</Card>);
    expect(screen.getByTestId('my-card')).toBeInTheDocument();
  });

  it('uses Apricot Slate surface and elevation tokens', () => {
    renderWithTheme(<Card data-testid="my-card">Content</Card>);

    expect(screen.getByTestId('my-card')).toHaveStyleRule(
      'background',
      lightTheme.colors.surface,
    );
    expect(screen.getByTestId('my-card')).toHaveStyleRule(
      'box-shadow',
      lightTheme.shadows.sm,
    );
    expect(screen.getByTestId('my-card')).toHaveStyleRule(
      'border',
      `1px solid ${lightTheme.colors.border}`,
    );
  });
});
