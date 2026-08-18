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
  test('renders the ad for a free user', () => {
    renderWithLicense(false);

    expect(screen.getByTestId('content-aware-ad')).toBeInTheDocument();
  });

  // The label is drawn by CSS on .ad-container, and AdContainer further down already carries that
  // class, so repeating it on the placement wrapper printed "Advertisement" twice per slot.
  test('leaves the ad-container class to the ad itself so the label is not repeated', () => {
    renderWithLicense(false, { className: 'ad-in-footer' });

    expect(screen.getByTestId('ad-slot')).not.toHaveClass('ad-container');
  });

  test('keeps the placement class on the wrapper', () => {
    renderWithLicense(false, { className: 'ad-in-footer' });

    expect(screen.getByTestId('ad-slot')).toHaveClass('ad-in-footer');
  });

  // Nothing at all, so a paid page is not left with a stray "Advertisement" label or its margin.
  test('renders nothing for a Pro user', () => {
    const { container } = renderWithLicense(true);

    expect(container).toBeEmptyDOMElement();
  });
});
