import React from 'react';
import { render, screen } from '@testing-library/react';
import HomeProBadge from './HomeProBadge';

describe('HomeProBadge', () => {
  test('confirms that Pro is active and custom aliases are available', () => {
    render(<HomeProBadge daysLeft={12} />);

    expect(screen.getByTestId('home-pro-active')).toHaveTextContent('Pro active');
    expect(screen.getByTestId('home-pro-active')).toHaveTextContent('12 days left');
    expect(screen.getByTestId('home-pro-active')).toHaveTextContent(/change the address/i);
  });
});
