import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../../theme/theme';
import { ActionMenuItem } from './ActionMenuItem';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

describe('ActionMenuItem', () => {
  it('renders children', () => {
    renderWithTheme(<ActionMenuItem>Send Email</ActionMenuItem>);
    expect(screen.getByRole('menuitem', { name: 'Send Email' })).toBeInTheDocument();
  });

  it('renders icon when provided', () => {
    renderWithTheme(
      <ActionMenuItem icon={<span data-testid="icon">📧</span>}>
        Send
      </ActionMenuItem>,
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('handles click events', () => {
    const onClick = jest.fn();
    renderWithTheme(
      <ActionMenuItem onClick={onClick}>Delete</ActionMenuItem>,
    );
    fireEvent.click(screen.getByRole('menuitem'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders danger variant', () => {
    renderWithTheme(
      <ActionMenuItem variant="danger">Delete Account</ActionMenuItem>,
    );
    expect(screen.getByRole('menuitem', { name: 'Delete Account' })).toBeInTheDocument();
  });
});
