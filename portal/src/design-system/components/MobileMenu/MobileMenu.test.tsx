import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../../theme/theme';
import { MobileMenu } from './MobileMenu';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

describe('MobileMenu', () => {
  it('does not render when closed', () => {
    renderWithTheme(
      <MobileMenu open={false} onClose={jest.fn()} title="Test">
        Content
      </MobileMenu>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders title and children when open', () => {
    renderWithTheme(
      <MobileMenu open={true} onClose={jest.fn()} title="Menu">
        Menu items
      </MobileMenu>,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Menu')).toBeInTheDocument();
    expect(screen.getByText('Menu items')).toBeInTheDocument();
  });

  it('calls onClose on Escape key', () => {
    const onClose = jest.fn();
    renderWithTheme(
      <MobileMenu open={true} onClose={onClose} title="Test">
        Content
      </MobileMenu>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on overlay click', () => {
    const onClose = jest.fn();
    renderWithTheme(
      <MobileMenu open={true} onClose={onClose} title="Test">
        Content
      </MobileMenu>,
    );
    fireEvent.click(screen.getByRole('dialog').parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when clicking inside the panel', () => {
    const onClose = jest.fn();
    renderWithTheme(
      <MobileMenu open={true} onClose={onClose} title="Test">
        Content
      </MobileMenu>,
    );
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
