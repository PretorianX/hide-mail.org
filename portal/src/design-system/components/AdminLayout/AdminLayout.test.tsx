import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../../theme/theme';
import { AdminLayout } from './AdminLayout';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

describe('AdminLayout', () => {
  it('renders children in main content area', () => {
    renderWithTheme(
      <AdminLayout sidebar={<div>Sidebar</div>}>
        <div>Main Content</div>
      </AdminLayout>,
    );
    expect(screen.getByText('Main Content')).toBeInTheDocument();
  });

  it('renders sidebar content', () => {
    renderWithTheme(
      <AdminLayout sidebar={<div>Full Sidebar</div>}>
        <div>Content</div>
      </AdminLayout>,
    );
    expect(screen.getByText('Full Sidebar')).toBeInTheDocument();
  });

  it('renders sidebarCollapsed content when provided', () => {
    renderWithTheme(
      <AdminLayout
        sidebar={<div>Full</div>}
        sidebarCollapsed={<div>NavRail</div>}
      >
        <div>Content</div>
      </AdminLayout>,
    );
    expect(screen.getByText('NavRail')).toBeInTheDocument();
  });

  it('renders header when provided', () => {
    renderWithTheme(
      <AdminLayout sidebar={<div>Side</div>} header={<div>Header Bar</div>}>
        <div>Content</div>
      </AdminLayout>,
    );
    expect(screen.getByText('Header Bar')).toBeInTheDocument();
  });

  it('has correct accessibility roles', () => {
    const { container } = renderWithTheme(
      <AdminLayout sidebar={<div>Side</div>}>
        <div>Content</div>
      </AdminLayout>,
    );
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(container.querySelector('aside')).toBeInTheDocument();
  });

  it('renders mobile menu when mobileOpen is true', () => {
    renderWithTheme(
      <AdminLayout sidebar={<div>Side</div>} mobileOpen>
        <div>Content</div>
      </AdminLayout>,
    );
    expect(screen.getByRole('dialog', { name: 'Menu' })).toBeInTheDocument();
  });

  it('does not render mobile menu when mobileOpen is false', () => {
    renderWithTheme(
      <AdminLayout sidebar={<div>Side</div>}>
        <div>Content</div>
      </AdminLayout>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('calls onMobileOpenChange when mobile menu overlay is clicked', async () => {
    const user = userEvent.setup();
    const onMobileOpenChange = jest.fn();
    renderWithTheme(
      <AdminLayout
        sidebar={<div>Side</div>}
        mobileOpen
        onMobileOpenChange={onMobileOpenChange}
      >
        <div>Content</div>
      </AdminLayout>,
    );
    const overlay = screen.getByTestId('mobile-menu-overlay');
    await user.click(overlay);
    expect(onMobileOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders sidebar content inside mobile menu when mobileOpen', () => {
    renderWithTheme(
      <AdminLayout sidebar={<div>Mobile Sidebar Content</div>} mobileOpen>
        <div>Content</div>
      </AdminLayout>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Menu' });
    expect(dialog).toHaveTextContent('Mobile Sidebar Content');
  });

  it('uses Apricot Slate shell surfaces', () => {
    const { container } = renderWithTheme(
      <AdminLayout sidebar={<div>Side</div>}>
        <div>Content</div>
      </AdminLayout>,
    );

    expect(container.firstChild).toHaveStyleRule(
      'background',
      lightTheme.colors.background,
    );
    expect(container.querySelector('aside')).toHaveStyleRule(
      'border-right',
      `1px solid ${lightTheme.colors.border}`,
    );
  });
});
