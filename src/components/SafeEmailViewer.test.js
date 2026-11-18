import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DOMPurify from 'dompurify';
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

  test('does not log message content to console in non-development builds', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const secretBody = 'TOP_SECRET_OTP_123456';
    try {
      render(<SafeEmailViewer htmlContent={`<p>${secretBody}</p>`} textContent={secretBody} />);
      const allLogged = [...logSpy.mock.calls, ...warnSpy.mock.calls]
        .flat()
        .map(String)
        .join(' ');
      expect(allLogged).not.toContain(secretBody);
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  test('blocks remote images, style tags, and CSS url() by default until user opts in', () => {
    DOMPurify.sanitize.mockImplementation((html) => html);
    const writes = [];
    Object.defineProperty(HTMLIFrameElement.prototype, 'contentDocument', {
      configurable: true,
      get: function() {
        return {
          open: jest.fn(),
          write: jest.fn((html) => writes.push(html)),
          close: jest.fn(),
          body: { scrollHeight: 500, offsetHeight: 500 },
          documentElement: { clientHeight: 500, scrollHeight: 500, offsetHeight: 500 },
          getElementsByTagName: jest.fn().mockReturnValue([]),
        };
      },
    });

    const htmlWithTracker =
      '<style>@import url("https://tracker.example/a.css");</style>' +
      '<div style="background: url(https://tracker.example/bg.png)">' +
      '<img src="https://tracker.example/pixel.gif" alt="pixel" />' +
      '<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" alt="inline" />' +
      '</div>';

    render(<SafeEmailViewer htmlContent={htmlWithTracker} />);

    expect(writes.length).toBeGreaterThan(0);
    const initialWrite = writes[writes.length - 1];
    expect(initialWrite).not.toContain('https://tracker.example/pixel.gif');
    expect(initialWrite).not.toContain('https://tracker.example/bg.png');
    expect(initialWrite).not.toContain('https://tracker.example/a.css');
    expect(initialWrite).toContain('data:image/gif;base64');
    expect(initialWrite).toContain("Content-Security-Policy");

    const loadButton = screen.getByRole('button', { name: /load remote content/i });
    fireEvent.click(loadButton);

    const optInWrite = writes[writes.length - 1];
    expect(optInWrite).toContain('https://tracker.example/pixel.gif');
  });
});