import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../../theme/theme';
import { NavRail } from './NavRail';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

const mockItems = [
  { id: 'inbox', icon: <span data-testid="icon-inbox">📥</span>, label: 'Inbox' },
  { id: 'sent', icon: <span data-testid="icon-sent">📤</span>, label: 'Sent' },
  { id: 'drafts', icon: <span data-testid="icon-drafts">📝</span>, label: 'Drafts' },
];

describe('NavRail', () => {
  it('renders all items as buttons', () => {
    const onSelect = jest.fn();
    renderWithTheme(
      <NavRail items={mockItems} onSelect={onSelect} />,
    );

    expect(screen.getByRole('button', { name: 'Inbox' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sent' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Drafts' })).toBeInTheDocument();
  });

  it('active item has aria-current="page"', () => {
    const onSelect = jest.fn();
    renderWithTheme(
      <NavRail items={mockItems} activeId="sent" onSelect={onSelect} />,
    );

    expect(screen.getByRole('button', { name: 'Sent' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('button', { name: 'Inbox' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('calls onSelect when clicked', () => {
    const onSelect = jest.fn();
    renderWithTheme(
      <NavRail items={mockItems} onSelect={onSelect} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Drafts' }));
    expect(onSelect).toHaveBeenCalledWith('drafts');

    fireEvent.click(screen.getByRole('button', { name: 'Inbox' }));
    expect(onSelect).toHaveBeenCalledWith('inbox');
  });

  it('renders logo when provided', () => {
    const onSelect = jest.fn();
    const logo = <span data-testid="logo">Logo</span>;
    renderWithTheme(
      <NavRail items={mockItems} onSelect={onSelect} logo={logo} />,
    );

    expect(screen.getByTestId('logo')).toBeInTheDocument();
  });
});
