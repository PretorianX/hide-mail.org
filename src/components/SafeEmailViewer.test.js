import React from 'react';
import { render, screen } from '@testing-library/react';
import SafeEmailViewer from './SafeEmailViewer';

// Mock DOMPurify
jest.mock('dompurify', () => ({
  sanitize: jest.fn(html => html)
}));

describe('SafeEmailViewer', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock iframe methods
    Object.defineProperty(HTMLIFrameElement.prototype, 'contentDocument', {
      get: function() {
        return {
          open: jest.fn(),
          write: jest.fn(),
          close: jest.fn(),
          body: {
            scrollHeight: 500,
            offsetHeight: 500
          },
          documentElement: {
            clientHeight: 500,
            scrollHeight: 500,
            offsetHeight: 500
          },
          getElementsByTagName: jest.fn().mockReturnValue([])
        };
      }
    });
    
    Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
      get: function() {
        return {
          document: {
            open: jest.fn(),
            write: jest.fn(),
            close: jest.fn(),
            body: {
              scrollHeight: 500,
              offsetHeight: 500
            },
            documentElement: {
              clientHeight: 500,
              scrollHeight: 500,
              offsetHeight: 500
            },
            getElementsByTagName: jest.fn().mockReturnValue([])
          }
        };
      }
    });
  });
  
  test('renders iframe when HTML content is provided', () => {
    render(<SafeEmailViewer htmlContent="<p>Test HTML</p>" />);
    
    // Check if iframe is rendered
    const iframe = document.querySelector('iframe');
    expect(iframe).toBeInTheDocument();
  });
  
  test('renders plain text when only text content is provided', () => {
    render(<SafeEmailViewer textContent="Test plain text" />);
    
    // Check if plain text is rendered
    const plainText = screen.getByText('Test plain text');
    expect(plainText).toBeInTheDocument();
    
    // Check that iframe is not rendered
    const iframe = document.querySelector('iframe');
    expect(iframe).not.toBeInTheDocument();
  });
  
  test('renders fallback message when no content is provided', () => {
    render(<SafeEmailViewer />);
    
    // Check if fallback message is rendered
    const fallbackMessage = screen.getByText('No content available for this email.');
    expect(fallbackMessage).toBeInTheDocument();
  });
  
  test('applies custom className when provided', () => {
    render(<SafeEmailViewer textContent="Test" className="custom-class" />);
    
    // Check if custom class is applied
    const container = document.querySelector('.custom-class');
    expect(container).toBeInTheDocument();
  });
}); 