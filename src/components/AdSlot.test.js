import React from 'react';
import { render, screen } from '@testing-library/react';
import AdSlot from './AdSlot';
import LicenseContext from '../context/LicenseContext';

jest.mock('./ContentAwareAd', () => {
  return function MockContentAwareAd(props) {
    return <div data-testid="content-aware-ad" data-slot={props.slot} />;
  };
});

const renderWithLicense = (isPro, props = {}) =>
  render(
    <LicenseContext.Provider value={{ isPro }}>
      <AdSlot slot="1234567890" {...props} />
    </LicenseContext.Provider>
  );

describe('AdSlot', () => {
  test('renders the labelled ad container for a free user', () => {
    renderWithLicense(false);

    expect(screen.getByTestId('ad-slot')).toHaveClass('ad-container');
    expect(screen.getByTestId('content-aware-ad')).toBeInTheDocument();
  });

  test('appends the placement class to the container', () => {
    renderWithLicense(false, { className: 'ad-in-footer' });

    const slot = screen.getByTestId('ad-slot');
    expect(slot).toHaveClass('ad-container');
    expect(slot).toHaveClass('ad-in-footer');
  });

  test('renders no ad-container for a Pro user so no Advertisement label is left behind', () => {
    const { container } = renderWithLicense(true);

    expect(container).toBeEmptyDOMElement();
    expect(container.querySelector('.ad-container')).toBeNull();
  });
});
