import React from 'react';
import { render, screen } from '@testing-library/react';
import AdContainer from './AdContainer';

// Mock the AdSense component
jest.mock('./AdSense', () => {
  return function MockAdSense(props) {
    return <div data-testid="adsense-mock" data-slot={props.slot} data-format={props.format} />;
  };
});

describe('AdContainer Component', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('renders placeholder in development mode', () => {
    process.env.NODE_ENV = 'development';
    
    render(<AdContainer slot="1234567890" width={300} height={250} position="sidebar" />);
    
    expect(screen.getByText('Google Ad (300x250)')).toBeInTheDocument();
  });

  test('renders AdSense component in production mode', () => {
    process.env.NODE_ENV = 'production';
    
    const { container } = render(
      <AdContainer slot="1234567890" width={300} height={250} position="sidebar" />
    );
    
    const adsenseMock = container.querySelector('[data-testid="adsense-mock"]');
    expect(adsenseMock).toBeInTheDocument();
    expect(adsenseMock).toHaveAttribute('data-slot', '1234567890');
  });

  test('applies correct CSS classes', () => {
    process.env.NODE_ENV = 'development';
    
    const { container } = render(
      <AdContainer 
        slot="1234567890" 
        width={300} 
        height={250} 
        position="sidebar" 
        className="custom-class" 
      />
    );
    
    const adContainer = container.firstChild;
    expect(adContainer).toHaveClass('ad-container');
    expect(adContainer).toHaveClass('ad-sidebar');
    expect(adContainer).toHaveClass('custom-class');
  });

  test('applies correct dimensions', () => {
    process.env.NODE_ENV = 'development';
    
    const { container } = render(
      <AdContainer slot="1234567890" width={728} height={90} />
    );
    
    const adContainer = container.firstChild;
    expect(adContainer).toHaveStyle('width: 728px');
    expect(adContainer).toHaveStyle('height: 90px');
    expect(screen.getByText('Google Ad (728x90)')).toBeInTheDocument();
  });
}); 