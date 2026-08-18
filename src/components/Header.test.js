import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router';
import Header from './Header';
import { ThemeProvider } from '../styles/ThemeContext';
import { HEADER_INK, HEADER_INK_STRONG } from '../styles/headerInk';
import { cssRulesFor } from '../test-utils/styledCss';

jest.mock('../context/LicenseContext', () => ({
  useLicense: () => ({ isPro: false, license: null }),
}));

const renderHeader = () =>
  render(
    <ThemeProvider>
      <BrowserRouter>
        <Header />
      </BrowserRouter>
    </ThemeProvider>
  );

const toRgb = hex => `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;

const inkOf = element => window.getComputedStyle(element).color;

// jsdom applies no pseudo-class rules, so state colours are read off the emitted stylesheet.
// The rendered ratios themselves are measured in headless Chrome, not here.
const stateRulesOf = (element, pseudo) =>
  cssRulesFor(element)
    .filter(cssText => cssText.split('{')[0].includes(pseudo))
    .join(' ');

describe('Header Component', () => {
  test('renders header with logo and navigation links', () => {
    renderHeader();

    // Check for logo text
    expect(screen.getByText('Hide Mail')).toBeInTheDocument();
    expect(screen.getByText('Your friendly temporary email service')).toBeInTheDocument();

    // Check that navigation links are present and point at the right pages
    const nav = within(screen.getByRole('navigation'));
    expect(nav.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(nav.getByRole('link', { name: 'Blog' })).toHaveAttribute('href', '/blog');
    expect(nav.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about-us');
    expect(nav.getByRole('link', { name: 'Contact' })).toHaveAttribute('href', '/contact-us');
    expect(nav.getByRole('link', { name: 'Go Pro' })).toHaveAttribute('href', '/pro');

    // Check that theme toggle button is present
    expect(screen.getByRole('button', { name: /switch to (dark|light) mode/i })).toBeInTheDocument();
  });

  test('presents Pro as a call to action and the other entries as plain links', () => {
    renderHeader();
    const nav = within(screen.getByRole('navigation'));

    expect(nav.getByRole('link', { name: 'Go Pro' })).toHaveClass('nav-pro-cta');

    ['Home', 'Blog', 'About', 'Contact'].forEach(label => {
      expect(nav.getByRole('link', { name: label })).not.toHaveClass('nav-pro-cta');
    });
  });

  test('renders the Pro entry last so it sits at the trailing edge of the nav', () => {
    renderHeader();

    const navLinks = within(screen.getByRole('navigation')).getAllByRole('link');
    expect(navLinks[navLinks.length - 1]).toHaveClass('nav-pro-cta');
  });
});

describe('Header ink on the orange bar', () => {
  test('plain nav links carry the dark header ink, not white', () => {
    renderHeader();
    const nav = within(screen.getByRole('navigation'));

    ['Home', 'Blog', 'About', 'Contact'].forEach(label => {
      expect(inkOf(nav.getByRole('link', { name: label }))).toBe(toRgb(HEADER_INK));
    });
  });

  test('nav links deepen their ink on hover and active instead of going back to white', () => {
    renderHeader();
    const home = within(screen.getByRole('navigation')).getByRole('link', { name: 'Home' });

    [':hover', ':active'].forEach(pseudo => {
      expect(stateRulesOf(home, pseudo)).toContain(`color: ${HEADER_INK_STRONG}`);
    });
  });

  test('nav links and the logo declare a focus indicator in the strong ink', () => {
    renderHeader();
    const nav = within(screen.getByRole('navigation'));
    const focusables = [
      nav.getByRole('link', { name: 'Home' }),
      screen.getByRole('link', { name: /Hide Mail/ }),
    ];

    focusables.forEach(element => {
      expect(stateRulesOf(element, ':focus-visible')).toContain(`outline: 3px solid ${HEADER_INK_STRONG}`);
    });
  });

  test('the title and the tagline carry the dark header ink', () => {
    renderHeader();

    expect(inkOf(screen.getByRole('heading', { level: 1, name: 'Hide Mail' }))).toBe(toRgb(HEADER_INK));
    expect(inkOf(screen.getByText('Your friendly temporary email service'))).toBe(toRgb(HEADER_INK));
  });

  test('the Pro CTA keeps its own ink on its white fill', () => {
    renderHeader();
    const proCta = within(screen.getByRole('navigation')).getByRole('link', { name: 'Go Pro' });

    expect(inkOf(proCta)).not.toBe(toRgb(HEADER_INK));
    expect(window.getComputedStyle(proCta).backgroundColor).toBe('rgb(255, 255, 255)');
  });
});
