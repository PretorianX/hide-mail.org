import React from 'react';
import { render, screen } from '@testing-library/react';
import AdSense from './AdSense';

// Mock the environment variables
const originalEnv = process.env;

describe('AdSense Component', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('renders placeholder in development mode', () => {
    process.env.NODE_ENV = 'development';
    process.env.REACT_APP_ADSENSE_CLIENT = 'ca-pub-9729692981183751';
    
    render(<AdSense slot="1234567890" />);
    
    expect(screen.getByText(/AdSense Placeholder/i)).toBeInTheDocument();
    expect(screen.getByText(/ca-pub-9729692981183751/i)).toBeInTheDocument();
  });

  test('renders placeholder when client ID is missing', () => {
    process.env.NODE_ENV = 'production';
    process.env.REACT_APP_ADSENSE_CLIENT = '';
    
    render(<AdSense slot="1234567890" />);
    
    expect(screen.getByText(/AdSense Placeholder/i)).toBeInTheDocument();
    expect(screen.getByText(/Not configured/i)).toBeInTheDocument();
  });

  test('renders AdSense ins element in production mode with client ID', () => {
    process.env.NODE_ENV = 'production';
    process.env.REACT_APP_ADSENSE_CLIENT = 'ca-pub-9729692981183751';
    
    const { container } = render(<AdSense slot="1234567890" />);
    
    const insElement = container.querySelector('ins.adsbygoogle');
    expect(insElement).toBeInTheDocument();
    expect(insElement).toHaveAttribute('data-ad-client', 'ca-pub-9729692981183751');
    expect(insElement).toHaveAttribute('data-ad-slot', '1234567890');
  });
}); 