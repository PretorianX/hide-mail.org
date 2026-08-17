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
});
