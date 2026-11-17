import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../../theme/theme';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuDivider,
  DropdownMenuSection,
} from './DropdownMenu';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

describe('DropdownMenu', () => {
  it('does not show menu by default', () => {
    renderWithTheme(
      <DropdownMenu trigger={<button>Open</button>}>
        <DropdownMenuItem onSelect={jest.fn()}>Item 1</DropdownMenuItem>
      </DropdownMenu>,
    );
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens menu on trigger click', () => {
    renderWithTheme(
      <DropdownMenu trigger={<button>Open</button>}>
        <DropdownMenuItem onSelect={jest.fn()}>Item 1</DropdownMenuItem>
      </DropdownMenu>,
    );
    fireEvent.click(screen.getByText('Open'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByText('Item 1')).toBeInTheDocument();
  });

  it('closes menu on item select', () => {
    const onSelect = jest.fn();
    renderWithTheme(
      <DropdownMenu trigger={<button>Open</button>}>
        <DropdownMenuItem onSelect={onSelect}>Action</DropdownMenuItem>
      </DropdownMenu>,
    );
    fireEvent.click(screen.getByText('Open'));
    fireEvent.click(screen.getByText('Action'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes menu on Escape key', () => {
    renderWithTheme(
      <DropdownMenu trigger={<button>Open</button>}>
        <DropdownMenuItem onSelect={jest.fn()}>Item</DropdownMenuItem>
      </DropdownMenu>,
    );
    fireEvent.click(screen.getByText('Open'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes menu on outside click', () => {
    renderWithTheme(
      <div>
        <DropdownMenu trigger={<button>Open</button>}>
          <DropdownMenuItem onSelect={jest.fn()}>Item</DropdownMenuItem>
        </DropdownMenu>
        <span data-testid="outside">Outside</span>
      </div>,
    );
    fireEvent.click(screen.getByText('Open'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('renders items with icons', () => {
    const icon = <span data-testid="icon">★</span>;
    renderWithTheme(
      <DropdownMenu trigger={<button>Open</button>}>
        <DropdownMenuItem icon={icon} onSelect={jest.fn()}>
          Starred
        </DropdownMenuItem>
      </DropdownMenu>,
    );
    fireEvent.click(screen.getByText('Open'));
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('renders keyboard shortcut hint', () => {
    renderWithTheme(
      <DropdownMenu trigger={<button>Open</button>}>
        <DropdownMenuItem shortcut="⌘C" onSelect={jest.fn()}>
          Copy
        </DropdownMenuItem>
      </DropdownMenu>,
    );
    fireEvent.click(screen.getByText('Open'));
    expect(screen.getByText('⌘C')).toBeInTheDocument();
  });

  it('renders sections with titles', () => {
    renderWithTheme(
      <DropdownMenu trigger={<button>Open</button>}>
        <DropdownMenuSection title="Actions">
          <DropdownMenuItem onSelect={jest.fn()}>Edit</DropdownMenuItem>
        </DropdownMenuSection>
      </DropdownMenu>,
    );
    fireEvent.click(screen.getByText('Open'));
    expect(screen.getByText('Actions')).toBeInTheDocument();
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });

  it('renders dividers', () => {
    renderWithTheme(
      <DropdownMenu trigger={<button>Open</button>}>
        <DropdownMenuItem onSelect={jest.fn()}>A</DropdownMenuItem>
        <DropdownMenuDivider />
        <DropdownMenuItem onSelect={jest.fn()}>B</DropdownMenuItem>
      </DropdownMenu>,
    );
    fireEvent.click(screen.getByText('Open'));
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  it('supports danger variant', () => {
    renderWithTheme(
      <DropdownMenu trigger={<button>Open</button>}>
        <DropdownMenuItem variant="danger" onSelect={jest.fn()}>
          Delete
        </DropdownMenuItem>
      </DropdownMenu>,
    );
    fireEvent.click(screen.getByText('Open'));
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('shows checkmark for selected items', () => {
    renderWithTheme(
      <DropdownMenu trigger={<button>Open</button>}>
        <DropdownMenuItem selected onSelect={jest.fn()}>
          Option A
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={jest.fn()}>
          Option B
        </DropdownMenuItem>
      </DropdownMenu>,
    );
    fireEvent.click(screen.getByText('Open'));
    const selectedItem = screen.getByText('Option A').closest('[role="menuitem"]');
    expect(selectedItem).toHaveAttribute('aria-checked', 'true');
  });

  it('supports disabled items', () => {
    const onSelect = jest.fn();
    renderWithTheme(
      <DropdownMenu trigger={<button>Open</button>}>
        <DropdownMenuItem disabled onSelect={onSelect}>
          Disabled
        </DropdownMenuItem>
      </DropdownMenu>,
    );
    fireEvent.click(screen.getByText('Open'));
    fireEvent.click(screen.getByText('Disabled'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('navigates with arrow keys', () => {
    renderWithTheme(
      <DropdownMenu trigger={<button>Open</button>}>
        <DropdownMenuItem onSelect={jest.fn()}>First</DropdownMenuItem>
        <DropdownMenuItem onSelect={jest.fn()}>Second</DropdownMenuItem>
        <DropdownMenuItem onSelect={jest.fn()}>Third</DropdownMenuItem>
      </DropdownMenu>,
    );
    fireEvent.click(screen.getByText('Open'));
    const menu = screen.getByRole('menu');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    const items = screen.getAllByRole('menuitem');
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(items[1]).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(items[0]).toHaveFocus();
  });

  it('selects item with Enter key', () => {
    const onSelect = jest.fn();
    renderWithTheme(
      <DropdownMenu trigger={<button>Open</button>}>
        <DropdownMenuItem onSelect={onSelect}>Action</DropdownMenuItem>
      </DropdownMenu>,
    );
    fireEvent.click(screen.getByText('Open'));
    const menu = screen.getByRole('menu');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getAllByRole('menuitem')[0], { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('supports controlled open state', () => {
    const onOpenChange = jest.fn();
    renderWithTheme(
      <DropdownMenu
        trigger={<button>Open</button>}
        open={true}
        onOpenChange={onOpenChange}
      >
        <DropdownMenuItem onSelect={jest.fn()}>Item</DropdownMenuItem>
      </DropdownMenu>,
    );
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });
});
