import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../../theme/theme';
import { SideMenu } from './SideMenu';
import type { SideMenuItem } from './SideMenu';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

const mockItems: SideMenuItem[] = [
  { id: 'home', icon: <span data-testid="icon-home">H</span>, label: 'Home' },
  { id: 'inbox', icon: <span data-testid="icon-inbox">I</span>, label: 'Inbox' },
  { id: 'drafts', icon: <span data-testid="icon-drafts">D</span>, label: 'Drafts' },
];

describe('SideMenu', () => {
  it('renders all items', () => {
    const onSelect = jest.fn();
    renderWithTheme(<SideMenu items={mockItems} onSelect={onSelect} />);

    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inbox' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Drafts' })).toBeInTheDocument();
  });

  it('active item has correct styling (renders with aria-current)', () => {
    const onSelect = jest.fn();
    renderWithTheme(
      <SideMenu items={mockItems} activeId="inbox" onSelect={onSelect} />
    );

    expect(screen.getByRole('button', { name: 'Inbox' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('button', { name: 'Home' })).not.toHaveAttribute(
      'aria-current'
    );
  });

  it('calls onSelect when item clicked', () => {
    const onSelect = jest.fn();
    renderWithTheme(<SideMenu items={mockItems} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button', { name: 'Drafts' }));
    expect(onSelect).toHaveBeenCalledWith('drafts');

    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    expect(onSelect).toHaveBeenCalledWith('home');
  });

  it('renders header when provided', () => {
    const onSelect = jest.fn();
    const header = <span data-testid="header">Logo & Title</span>;
    renderWithTheme(
      <SideMenu items={mockItems} onSelect={onSelect} header={header} />
    );

    expect(screen.getByTestId('header')).toBeInTheDocument();
  });

  it('expands and collapses children on click', () => {
    const onSelect = jest.fn();
    const itemsWithChildren: SideMenuItem[] = [
      ...mockItems,
      {
        id: 'threads',
        label: 'Threads',
        children: [
          { id: 'all', label: 'All' },
          { id: 'unread', label: 'Unread' },
        ],
      },
    ];

    renderWithTheme(
      <SideMenu items={itemsWithChildren} onSelect={onSelect} />
    );

    // Children not visible initially
    expect(screen.queryByRole('button', { name: 'All' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unread' })).not.toBeInTheDocument();

    // Click parent to expand
    fireEvent.click(screen.getByRole('button', { name: 'Threads' }));

    // Children now visible
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unread' })).toBeInTheDocument();

    // Click parent again to collapse
    fireEvent.click(screen.getByRole('button', { name: 'Threads' }));

    // Children hidden again
    expect(screen.queryByRole('button', { name: 'All' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unread' })).not.toBeInTheDocument();
  });

  it('calls onSelect when child item clicked', () => {
    const onSelect = jest.fn();
    const itemsWithChildren: SideMenuItem[] = [
      {
        id: 'threads',
        label: 'Threads',
        children: [
          { id: 'all', label: 'All' },
          { id: 'unread', label: 'Unread' },
        ],
      },
    ];

    renderWithTheme(
      <SideMenu items={itemsWithChildren} onSelect={onSelect} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Threads' }));
    fireEvent.click(screen.getByRole('button', { name: 'Unread' }));

    expect(onSelect).toHaveBeenCalledWith('unread');
  });
});
