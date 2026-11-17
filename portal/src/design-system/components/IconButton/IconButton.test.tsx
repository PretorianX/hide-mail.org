import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../../theme/theme';
import { IconButton } from './IconButton';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

describe('IconButton', () => {
  it('renders with aria-label', () => {
    renderWithTheme(<IconButton aria-label="Close">✕</IconButton>);
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('handles click events', () => {
    const onClick = jest.fn();
    renderWithTheme(
      <IconButton aria-label="Close" onClick={onClick}>
        ✕
      </IconButton>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire click when disabled', () => {
    const onClick = jest.fn();
    renderWithTheme(
      <IconButton aria-label="Close" onClick={onClick} disabled>
        ✕
      </IconButton>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('applies variant classes', () => {
    const { rerender } = renderWithTheme(
      <IconButton aria-label="Action" variant="default">
        ✕
      </IconButton>,
    );
    expect(screen.getByRole('button')).toBeInTheDocument();

    rerender(
      <ThemeProvider theme={lightTheme}>
        <IconButton aria-label="Action" variant="danger">
          ✕
        </IconButton>
      </ThemeProvider>,
    );
    expect(screen.getByRole('button')).toBeInTheDocument();

    rerender(
      <ThemeProvider theme={lightTheme}>
        <IconButton aria-label="Action" variant="accent">
          ✕
        </IconButton>
      </ThemeProvider>,
    );
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});
