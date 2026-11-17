import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../../theme/theme';
import { Modal } from './Modal';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

describe('Modal', () => {
  it('does not render when closed', () => {
    renderWithTheme(
      <Modal open={false} onClose={jest.fn()} title="Test">
        Content
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders title and children when open', () => {
    renderWithTheme(
      <Modal open={true} onClose={jest.fn()} title="My Modal">
        Modal body
      </Modal>,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('My Modal')).toBeInTheDocument();
    expect(screen.getByText('Modal body')).toBeInTheDocument();
  });

  it('calls onClose on Escape key', () => {
    const onClose = jest.fn();
    renderWithTheme(
      <Modal open={true} onClose={onClose} title="Test">
        Content
      </Modal>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on overlay click', () => {
    const onClose = jest.fn();
    renderWithTheme(
      <Modal open={true} onClose={onClose} title="Test">
        Content
      </Modal>,
    );
    fireEvent.click(screen.getByRole('dialog').parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when clicking inside the modal', () => {
    const onClose = jest.fn();
    renderWithTheme(
      <Modal open={true} onClose={onClose} title="Test">
        Content
      </Modal>,
    );
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders footer when provided', () => {
    renderWithTheme(
      <Modal
        open={true}
        onClose={jest.fn()}
        title="Test"
        footer={<button>Save</button>}
      >
        Content
      </Modal>,
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('does not render footer when not provided', () => {
    renderWithTheme(
      <Modal open={true} onClose={jest.fn()} title="Test">
        Content
      </Modal>,
    );
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });
});
