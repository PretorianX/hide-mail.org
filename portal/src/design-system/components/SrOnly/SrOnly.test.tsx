import { render, screen } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../../theme/theme';
import { SrOnly } from './SrOnly';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

describe('SrOnly', () => {
  it('renders children in the DOM', () => {
    renderWithTheme(<SrOnly>Screen reader text</SrOnly>);
    expect(screen.getByText('Screen reader text')).toBeInTheDocument();
  });

  it('applies visually-hidden styles', () => {
    renderWithTheme(<SrOnly>Hidden text</SrOnly>);
    const el = screen.getByText('Hidden text');
    const styles = window.getComputedStyle(el);
    expect(styles.position).toBe('absolute');
    expect(styles.width).toBe('1px');
    expect(styles.height).toBe('1px');
    expect(styles.overflow).toBe('hidden');
  });
});
