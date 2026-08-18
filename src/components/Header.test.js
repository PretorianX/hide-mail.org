import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router';
import Header from './Header';
import { ThemeProvider } from '../styles/ThemeContext';

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
