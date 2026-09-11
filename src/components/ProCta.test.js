import React from 'react';
import { render, screen } from '@testing-library/react';
import ProCta from './ProCta';
import { PAYPAL_ORDER_URL } from '../utils/paypal';

describe('ProCta', () => {
  test('sends the visitor to the PayPal order instead of Pro checkout', () => {
    render(<ProCta />);

    const link = screen.getByTestId('pro-cta-link');
    expect(link).toHaveAttribute('href', PAYPAL_ORDER_URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(link).toHaveTextContent('Pay with PayPal');
  });

  // The ink rules are keyed on `a.pro-cta-button`, so the class has to stay on the anchor itself.
  // jsdom resolves no real cascade, so the contrast itself is measured in the headless-Chrome run.
  test('renders the call to action as an anchor carrying the pro-cta-button class', () => {
    render(<ProCta />);

    const link = screen.getByTestId('pro-cta-link');
    expect(link.tagName).toBe('A');
    expect(link).toHaveClass('pro-cta-button');
    expect(link).toHaveTextContent('Pay with PayPal');
  });
});
