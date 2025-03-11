import React from 'react';
import { render, screen, act } from '@testing-library/react';
import AdSense from './AdSense';

// Mock the environment variables
const originalEnv = process.env;
const originalWindow = global.window;

// Mock useState and useEffect
jest.mock('react', () => {
  const originalReact = jest.requireActual('react');
  return {
    ...originalReact,
    useState: jest.fn((initialValue) => [initialValue, jest.fn()]),
    useEffect: jest.fn((callback) => callback()),
  };
});

describe('AdSense Component', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    // Mock window.adsbygoogle
    global.window = {
      adsbygoogle: [],
      __RUNTIME_CONFIG__: {
        adsense: {
          client: 'ca-pub-9729692981183751'
        }
      }
    };
    global.window.adsbygoogle.push = jest.fn();
    
    // Reset React hooks mocks
    React.useState.mockImplementation((initialValue) => [
      initialValue === '' ? 'ca-pub-9729692981183751' : initialValue,
      jest.fn()
    ]);
    React.useEffect.mockImplementation((callback) => {
      callback();
      return jest.fn(); // Return cleanup function
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    global.window = originalWindow;
    jest.clearAllMocks();
  });

  test('renders placeholder in development mode', () => {
    process.env.NODE_ENV = 'development';
    process.env.REACT_APP_ADSENSE_CLIENT = 'ca-pub-9729692981183751';
    
    // Mock useState to return the client ID
    React.useState.mockImplementationOnce(() => ['ca-pub-9729692981183751', jest.fn()]);
    
    render(<AdSense slot="1234567890" />);
    
    expect(screen.getByText(/AdSense Manual Ad Placeholder/i)).toBeInTheDocument();
    expect(screen.getByText(/ca-pub-9729692981183751/i)).toBeInTheDocument();
  });

  test('renders placeholder when client ID is missing', () => {
    process.env.NODE_ENV = 'production';
    process.env.REACT_APP_ADSENSE_CLIENT = '';
    global.window.__RUNTIME_CONFIG__.adsense.client = '';
    
    // Mock useState to return empty client ID
    React.useState.mockImplementationOnce(() => ['', jest.fn()]);
    
    render(<AdSense slot="1234567890" />);
    
    expect(screen.getByText(/AdSense Manual Ad Placeholder/i)).toBeInTheDocument();
    expect(screen.getByText(/Not configured/i)).toBeInTheDocument();
  });

  test('renders AdSense ins element in production mode with client ID', () => {
    process.env.NODE_ENV = 'production';
    process.env.REACT_APP_ADSENSE_CLIENT = '';
    global.window.__RUNTIME_CONFIG__.adsense.client = 'ca-pub-9729692981183751';
    
    // Mock useState to return the client ID
    React.useState.mockImplementationOnce(() => ['ca-pub-9729692981183751', jest.fn()]);
    
    const { container } = render(<AdSense slot="1234567890" />);
    
    const insElement = container.querySelector('ins.adsbygoogle');
    expect(insElement).toBeInTheDocument();
    expect(insElement).toHaveAttribute('data-ad-client', 'ca-pub-9729692981183751');
    expect(insElement).toHaveAttribute('data-ad-slot', '1234567890');
    expect(global.window.adsbygoogle.push).toHaveBeenCalled();
  });

  test('renders auto ad placeholder in development mode', () => {
    process.env.NODE_ENV = 'development';
    process.env.REACT_APP_ADSENSE_CLIENT = 'ca-pub-9729692981183751';
    
    // Mock useState to return the client ID
    React.useState.mockImplementationOnce(() => ['ca-pub-9729692981183751', jest.fn()]);
    
    render(<AdSense autoAd={true} />);
    
    expect(screen.getByText(/AdSense Auto Ad Placeholder/i)).toBeInTheDocument();
  });

  test('renders nothing for auto ads in production mode', () => {
    process.env.NODE_ENV = 'production';
    process.env.REACT_APP_ADSENSE_CLIENT = '';
    global.window.__RUNTIME_CONFIG__.adsense.client = 'ca-pub-9729692981183751';
    
    // Mock useState to return the client ID
    React.useState.mockImplementationOnce(() => ['ca-pub-9729692981183751', jest.fn()]);
    
    const { container } = render(<AdSense autoAd={true} />);
    
    expect(container.firstChild).toBeNull();
    // Auto ads are now handled by the script tag with client parameter
    expect(global.window.adsbygoogle.push).not.toHaveBeenCalled();
  });

  test('prefers runtime config over process.env', () => {
    process.env.NODE_ENV = 'production';
    process.env.REACT_APP_ADSENSE_CLIENT = 'ca-pub-old-value';
    global.window.__RUNTIME_CONFIG__.adsense.client = 'ca-pub-9729692981183751';
    
    // Mock useState to return the client ID from runtime config
    React.useState.mockImplementationOnce(() => ['ca-pub-9729692981183751', jest.fn()]);
    
    const { container } = render(<AdSense slot="1234567890" />);
    
    const insElement = container.querySelector('ins.adsbygoogle');
    expect(insElement).toHaveAttribute('data-ad-client', 'ca-pub-9729692981183751');
  });
  
  test('updates client ID when runtime config changes', () => {
    process.env.NODE_ENV = 'production';
    
    // Mock useState to simulate state update
    const setClientId = jest.fn();
    React.useState.mockImplementationOnce(() => ['', setClientId]);
    
    // Mock useEffect to simulate interval
    React.useEffect.mockImplementationOnce((callback) => {
      callback();
      // Simulate interval callback
      global.window.__RUNTIME_CONFIG__.adsense.client = 'ca-pub-9729692981183751';
      callback();
      return jest.fn();
    });
    
    render(<AdSense slot="1234567890" />);
    
    // Verify that setClientId was called with the new value
    expect(setClientId).toHaveBeenCalledWith('ca-pub-9729692981183751');
  });
}); 