import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import ProCta from './ProCta';

describe('ProCta', () => {
  test('links to the Pro page', () => {
    render(
      <MemoryRouter>
        <ProCta />
      </MemoryRouter>
    );

    expect(screen.getByTestId('pro-cta-link')).toHaveAttribute('href', '/pro');
    expect(screen.getByText(/get hide mail pro/i)).toBeInTheDocument();
  });

  // The ink rules are keyed on `a.pro-cta-button`, so the class has to stay on the anchor itself.
  // jsdom resolves no real cascade, so the contrast itself is measured in the headless-Chrome run.
  test('renders the call to action as an anchor carrying the pro-cta-button class', () => {
    render(
      <MemoryRouter>
        <ProCta />
      </MemoryRouter>
    );

    const link = screen.getByTestId('pro-cta-link');
    expect(link.tagName).toBe('A');
    expect(link).toHaveClass('pro-cta-button');
    expect(link).toHaveTextContent('Get Hide Mail Pro');
  });
});
