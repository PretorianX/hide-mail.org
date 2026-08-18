import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router';
import NavProCta from './NavProCta';

const renderCta = (props) =>
  render(
    <BrowserRouter>
      <NavProCta {...props} />
    </BrowserRouter>
  );

describe('NavProCta', () => {
  describe('when the visitor is not a Pro subscriber', () => {
    test('renders an action-worded link to the Pro page', () => {
      renderCta({ isPro: false, daysLeft: null });

      const cta = screen.getByRole('link', { name: /go pro/i });
      expect(cta).toHaveAttribute('href', '/pro');
    });

    test('carries the CTA class so it is styled as a button, not a plain nav link', () => {
      renderCta({ isPro: false, daysLeft: null });

      expect(screen.getByRole('link', { name: /go pro/i })).toHaveClass('nav-pro-cta');
    });

    test('does not show subscription status', () => {
      renderCta({ isPro: false, daysLeft: null });

      expect(screen.queryByTestId('header-pro-days')).not.toBeInTheDocument();
    });
  });

  describe('when the visitor already has Pro', () => {
    test('shows the remaining days instead of an upgrade prompt', () => {
      renderCta({ isPro: true, daysLeft: 12 });

      expect(screen.getByTestId('header-pro-days')).toHaveTextContent('12 days left');
      expect(screen.queryByRole('link', { name: /go pro/i })).not.toBeInTheDocument();
    });

    test('keeps the CTA class so dark-theme link overrides stay excluded', () => {
      renderCta({ isPro: true, daysLeft: 12 });

      const pill = screen.getByRole('link', { name: /pro/i });
      expect(pill).toHaveClass('nav-pro-cta');
      expect(pill).toHaveAttribute('href', '/pro');
    });

    test('omits the day count when the licence has no expiry information', () => {
      renderCta({ isPro: true, daysLeft: null });

      expect(screen.queryByTestId('header-pro-days')).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: /pro/i })).toBeInTheDocument();
    });
  });
});
