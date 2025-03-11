import React from 'react';
import { render, screen } from '@testing-library/react';
import AdContainer from './AdContainer';

// Mock the AdSense component
jest.mock('./AdSense', () => {
  return function MockAdSense(props) {
    const { responsive, ...otherProps } = props;
    return (
      <div 
        data-testid="adsense-mock" 
        data-responsive={responsive ? responsive.toString() : undefined}
        {...otherProps} 
      />
    );
  };
});

describe('AdContainer', () => {
  let originalNodeEnv;
  
  beforeEach(() => {
    // Save the original NODE_ENV
    originalNodeEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    // Restore the original NODE_ENV
    process.env.NODE_ENV = originalNodeEnv;
  });

  test('renders placeholder in development mode', () => {
    // Set NODE_ENV to development
    process.env.NODE_ENV = 'development';

    render(<AdContainer slot="1234567890" />);
    
    // Check if the placeholder text is rendered
    expect(screen.getByText(/Google Ad \(300x250\)/i)).toBeInTheDocument();
  });

  test('renders AdSense in production mode', () => {
    // Set NODE_ENV to production
    process.env.NODE_ENV = 'production';

    render(<AdContainer slot="1234567890" />);
    
    // Check if the AdSense component is rendered
    expect(screen.getByTestId('adsense-mock')).toBeInTheDocument();
  });

  test('applies custom dimensions', () => {
    process.env.NODE_ENV = 'development';

    render(<AdContainer slot="1234567890" width={728} height={90} />);
    
    // Check if the custom dimensions are applied
    expect(screen.getByText(/Google Ad \(728x90\)/i)).toBeInTheDocument();
  });

  test('applies position class', () => {
    render(<AdContainer slot="1234567890" position="sidebar" />);
    
    // Check if the position class is applied
    const container = screen.getByTestId('ad-container');
    expect(container.className).toContain('ad-sidebar');
  });

  test('applies custom class name', () => {
    render(<AdContainer slot="1234567890" className="custom-class" />);
    
    // Check if the custom class is applied
    const container = screen.getByTestId('ad-container');
    expect(container.className).toContain('custom-class');
  });

  test('does not render when contentAvailable is false', () => {
    render(<AdContainer slot="1234567890" contentAvailable={false} />);
    
    // Check that the ad container is not rendered
    const container = screen.queryByTestId('ad-container');
    expect(container).not.toBeInTheDocument();
  });

  test('renders when contentAvailable is true', () => {
    render(<AdContainer slot="1234567890" contentAvailable={true} />);
    
    // Check that the ad container is rendered
    const container = screen.getByTestId('ad-container');
    expect(container).toBeInTheDocument();
  });
}); 