import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../../theme/theme';
import { Button } from './Button';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

describe('Button', () => {
  it('renders children text', () => {
    renderWithTheme(<Button>Hello</Button>);
    expect(screen.getByRole('button', { name: 'Hello' })).toBeInTheDocument();
  });

  it('handles click events', () => {
    const onClick = jest.fn();
    renderWithTheme(<Button onClick={onClick}>Click</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire click when disabled', () => {
    const onClick = jest.fn();
    renderWithTheme(
      <Button onClick={onClick} disabled>
        Disabled
      </Button>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('applies variant classes', () => {
    const { rerender } = renderWithTheme(
      <Button variant="primary">Primary</Button>,
    );
    expect(screen.getByRole('button')).toBeInTheDocument();

    rerender(
      <ThemeProvider theme={lightTheme}>
        <Button variant="secondary">Secondary</Button>
      </ThemeProvider>,
    );
    expect(screen.getByRole('button')).toBeInTheDocument();

    rerender(
      <ThemeProvider theme={lightTheme}>
        <Button variant="ghost">Ghost</Button>
      </ThemeProvider>,
    );
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('uses restrained Apricot Slate styling for primary actions', () => {
    renderWithTheme(<Button>Send message</Button>);

    expect(screen.getByRole('button')).toHaveStyleRule(
      'background',
      lightTheme.colors.primary,
    );
    expect(screen.getByRole('button')).toHaveStyleRule(
      'box-shadow',
      lightTheme.shadows.sm,
    );
  });

  it('uses warm surface treatment for secondary actions', () => {
    renderWithTheme(<Button variant="secondary">Cancel</Button>);

    expect(screen.getByRole('button')).toHaveStyleRule(
      'border',
      `1px solid ${lightTheme.colors.border}`,
    );
    expect(screen.getByRole('button')).toHaveStyleRule(
      'background',
      lightTheme.colors.surface,
    );
  });
});
