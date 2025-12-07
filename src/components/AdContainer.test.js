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

// Mock the useAdBlockDetection hook
let mockAdBlockDetected = false;
jest.mock('../hooks/useAdBlockDetection', () => {
  return () => mockAdBlockDetected;
});

// Mock the AdBlockDonateMessage component
jest.mock('./AdBlockDonateMessage', () => {
  return function MockAdBlockDonateMessage({ width, height, className }) {
    return (
      <div 
        data-testid="adblock-donate-message-mock"
        data-width={width}
        data-height={height}
        className={className}
      >
        AdBlock Donate Message
      </div>
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

  describe('adblock detection', () => {
    beforeEach(() => {
      mockAdBlockDetected = false;
    });

    test('renders AdBlockDonateMessage when adblock is detected', () => {
      mockAdBlockDetected = true;
      
      render(<AdContainer slot="1234567890" />);
      
      expect(screen.getByTestId('adblock-donate-message-mock')).toBeInTheDocument();
    });

    test('renders normal ad when adblock is not detected', () => {
      mockAdBlockDetected = false;
      process.env.NODE_ENV = 'development';
      
      render(<AdContainer slot="1234567890" />);
      
      expect(screen.queryByTestId('adblock-donate-message-mock')).not.toBeInTheDocument();
      expect(screen.getByText(/Google Ad/i)).toBeInTheDocument();
    });

    test('passes correct dimensions to AdBlockDonateMessage', () => {
      mockAdBlockDetected = true;
      
      render(<AdContainer slot="1234567890" width={728} height={90} />);
      
      const donateMessage = screen.getByTestId('adblock-donate-message-mock');
      expect(donateMessage.getAttribute('data-width')).toBe('728');
      expect(donateMessage.getAttribute('data-height')).toBe('90');
    });

    test('applies horizontal class for wide banners', () => {
      mockAdBlockDetected = true;
      
      render(<AdContainer slot="1234567890" width={728} height={90} format="horizontal" />);
      
      const donateMessage = screen.getByTestId('adblock-donate-message-mock');
      expect(donateMessage.className).toContain('horizontal');
    });

    test('applies compact class for small height ads', () => {
      mockAdBlockDetected = true;
      
      render(<AdContainer slot="1234567890" width={300} height={100} />);
      
      const donateMessage = screen.getByTestId('adblock-donate-message-mock');
      expect(donateMessage.className).toContain('compact');
    });

    test('shows AdBlockDonateMessage even when contentAvailable is false', () => {
      mockAdBlockDetected = true;
      
      render(<AdContainer slot="1234567890" contentAvailable={false} />);
      
      // Should still show donate message when adblock is detected
      expect(screen.getByTestId('adblock-donate-message-mock')).toBeInTheDocument();
    });
  });
}); 