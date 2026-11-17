import { render, screen } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { lightTheme } from '../../theme/theme';
import { Header, HeaderBrandName, BrandIcon } from './Header';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>);
}

describe('Header', () => {
  it('renders as a banner landmark', () => {
    renderWithTheme(<Header logo={<span>Logo</span>} />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('renders logo slot', () => {
    renderWithTheme(<Header logo={<span>MailDuck</span>} />);
    expect(screen.getByText('MailDuck')).toBeInTheDocument();
  });

  it('renders navigation items', () => {
    const { container } = renderWithTheme(
      <Header
        logo={<span>Logo</span>}
        nav={
          <>
            <a href="/inbox">Inbox</a>
            <a href="/sent">Sent</a>
          </>
        }
      />,
    );
    expect(container.querySelector('nav')).toBeInTheDocument();
    expect(screen.getByText('Inbox')).toBeInTheDocument();
    expect(screen.getByText('Sent')).toBeInTheDocument();
  });

  it('renders actions slot', () => {
    renderWithTheme(
      <Header
        logo={<span>Logo</span>}
        actions={<button>Sign in</button>}
      />,
    );
    expect(screen.getByText('Sign in')).toBeInTheDocument();
  });

  it('renders all three slots together', () => {
    renderWithTheme(
      <Header
        logo={<span>Brand</span>}
        nav={<a href="/">Home</a>}
        actions={<button>Profile</button>}
      />,
    );
    expect(screen.getByText('Brand')).toBeInTheDocument();
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Profile')).toBeInTheDocument();
  });

  it('applies sticky variant', () => {
    renderWithTheme(
      <Header logo={<span>Logo</span>} sticky />,
    );
    const banner = screen.getByRole('banner');
    expect(banner).toBeInTheDocument();
  });

  it('renders without nav or actions', () => {
    renderWithTheme(<Header logo={<span>Solo</span>} />);
    expect(screen.getByText('Solo')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('renders mobileActions when provided', () => {
    renderWithTheme(
      <Header
        logo={<span>Logo</span>}
        actions={<button>Desktop action</button>}
        mobileActions={<button>Hamburger</button>}
      />,
    );
    expect(screen.getByText('Hamburger')).toBeInTheDocument();
  });

  it('renders HeaderBrandName in logo slot', () => {
    renderWithTheme(
      <Header
        logo={
          <>
            <span>Icon</span>
            <HeaderBrandName>MailDuck</HeaderBrandName>
          </>
        }
      />,
    );
    expect(screen.getByText('MailDuck')).toBeInTheDocument();
  });

  it('renders BrandIcon as a rounded image', () => {
    renderWithTheme(
      <Header logo={<BrandIcon src="/favicon-32x32.png" alt="MailDuck" />} />,
    );
    const img = screen.getByAltText('MailDuck');
    expect(img).toBeInTheDocument();
    expect(img.tagName).toBe('IMG');
  });

  it('wraps logo in link when logoHref is provided', () => {
    renderWithTheme(
      <Header logo={<span>Logo</span>} logoHref="/" />,
    );
    const link = screen.getByRole('link', { name: 'Home' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/');
    expect(link).toHaveTextContent('Logo');
  });

  it('uses the theme border for the shell divider', () => {
    renderWithTheme(<Header logo={<span>Logo</span>} />);

    expect(screen.getByRole('banner')).toHaveStyleRule(
      'border-bottom',
      `1px solid ${lightTheme.colors.border}`,
    );
  });
});
