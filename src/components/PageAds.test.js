import React from 'react';
import { render, screen } from '@testing-library/react';
import PageAds from './PageAds';

// Mock the ContentAwareAd component
jest.mock('./ContentAwareAd', () => {
  return function MockContentAwareAd(props) {
    return (
      <div data-testid="content-aware-ad" data-position={props.position} data-slot={props.slot}>
        Mock Ad
      </div>
    );
  };
});

describe('PageAds Component', () => {
  test('renders top ad with correct props', () => {
    render(<PageAds position="top" slot="1234567890" />);
    
    const adElement = screen.getByTestId('content-aware-ad');
    expect(adElement).toBeInTheDocument();
    expect(adElement).toHaveAttribute('data-position', 'top');
    expect(adElement).toHaveAttribute('data-slot', '1234567890');
  });

  test('renders bottom ad with correct props', () => {
    render(<PageAds position="bottom" slot="9876543210" />);
    
    const adElement = screen.getByTestId('content-aware-ad');
    expect(adElement).toBeInTheDocument();
    expect(adElement).toHaveAttribute('data-position', 'bottom');
    expect(adElement).toHaveAttribute('data-slot', '9876543210');
  });

  test('applies correct wrapper class based on position', () => {
    const { container, rerender } = render(<PageAds position="top" slot="1234567890" />);
    
    expect(container.firstChild).toHaveClass('page-ad');
    expect(container.firstChild).toHaveClass('page-ad-top');
    
    rerender(<PageAds position="bottom" slot="9876543210" />);
    
    expect(container.firstChild).toHaveClass('page-ad');
    expect(container.firstChild).toHaveClass('page-ad-bottom');
  });
}); 