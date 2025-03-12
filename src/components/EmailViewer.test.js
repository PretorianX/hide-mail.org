import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import SafeEmailViewer from './SafeEmailViewer';

// Mock DOMPurify
jest.mock('dompurify', () => ({
  sanitize: jest.fn(content => content)
}));

describe('Email Content Display', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock console methods to avoid cluttering test output
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // Mock the iframe ref
    const mockIframe = {
      contentDocument: {
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
      },
      contentWindow: {
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
      },
      style: {}
    };
    
    // Mock the ref
    jest.spyOn(React, 'useRef').mockImplementation(() => ({
      current: mockIframe
    }));
    
    // Mock MutationObserver
    global.MutationObserver = class {
      constructor(callback) {
        this.callback = callback;
      }
      observe() {}
      disconnect() {}
    };
    
    // Mock useState to bypass loading state
    jest.spyOn(React, 'useState')
      .mockImplementationOnce(() => [false, jest.fn()]) // isLoading
      .mockImplementationOnce(() => [500, jest.fn()]) // iframeHeight
      .mockImplementationOnce(() => [0, jest.fn()]); // renderKey
  });
  
  test('SafeEmailViewer displays HTML content correctly', () => {
    // HTML content that would be passed from EmailViewer
    const mockHtmlContent = '<html><body><h1>Email Title</h1><p>This is the full email content with HTML formatting.</p></body></html>';
    
    // Render the SafeEmailViewer component directly with the HTML content
    const { container } = render(
      <SafeEmailViewer 
        htmlContent={mockHtmlContent} 
        textContent="" 
      />
    );
    
    // Check that an iframe is created for HTML content
    const iframe = container.querySelector('iframe');
    expect(iframe).toBeTruthy();
  });
  
  test('SafeEmailViewer displays plain text content when no HTML is available', () => {
    // Plain text content that would be passed from EmailViewer
    const mockTextContent = 'This is a plain text email without any HTML formatting.\nIt has multiple lines.\nAnd should be displayed properly.';
    
    // Render the SafeEmailViewer component directly with the text content
    const { container } = render(
      <SafeEmailViewer 
        htmlContent="" 
        textContent={mockTextContent} 
      />
    );
    
    // Check that a div with class "plain-text" is created for text content
    const plainTextDiv = container.querySelector('.plain-text');
    expect(plainTextDiv).toBeTruthy();
  });
}); 