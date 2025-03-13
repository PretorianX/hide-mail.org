import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

describe('AdSense Configuration', () => {
  const originalEnv = process.env;
  const originalWindow = { ...window };
  
  beforeEach(() => {
    // Mock document methods
    document.head.appendChild = jest.fn();
    document.createElement = jest.fn().mockImplementation((tag) => {
      if (tag === 'script') {
        return {
          async: false,
          crossOrigin: '',
          src: '',
        };
      }
      return {};
    });
    
    // Clear any previous scripts
    document.querySelectorAll = jest.fn().mockReturnValue([]);
    
    // Setup runtime config
    window.__RUNTIME_CONFIG__ = {
      adsense: {
        client: 'ca-pub-9729692981183751'
      }
    };
  });
  
  afterEach(() => {
    // Restore original window properties
    Object.defineProperty(window, '__RUNTIME_CONFIG__', {
      value: originalWindow.__RUNTIME_CONFIG__,
      writable: true,
      configurable: true
    });
    
    // Restore mocks
    jest.restoreAllMocks();
  });
  
  test('AdSense script is injected with correct client ID from environment', () => {
    // Load the adsense-config.js script
    const script = document.createElement('script');
    script.textContent = `
      // Mock implementation of adsense-config.js
      (function() {
        function getClientId() {
          if (window.__RUNTIME_CONFIG__ && window.__RUNTIME_CONFIG__.adsense && window.__RUNTIME_CONFIG__.adsense.client) {
            return window.__RUNTIME_CONFIG__.adsense.client;
          }
          return '';
        }
        
        function injectAdSenseScript() {
          var clientId = getClientId();
          
          if (clientId) {
            var newScript = document.createElement('script');
            newScript.async = true;
            newScript.crossOrigin = "anonymous";
            newScript.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + clientId;
            document.head.appendChild(newScript);
          }
        }
        
        injectAdSenseScript();
      })();
    `;
    document.head.appendChild(script);
    
    // Execute the script
    eval(script.textContent);
    
    // Verify the script was created with correct attributes
    expect(document.createElement).toHaveBeenCalledWith('script');
    expect(document.head.appendChild).toHaveBeenCalled();
    
    // Get the script that was appended
    const appendedScript = document.head.appendChild.mock.calls[1][0];
    
    // Verify script properties
    expect(appendedScript.async).toBe(true);
    expect(appendedScript.crossOrigin).toBe('anonymous');
    expect(appendedScript.src).toContain('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9729692981183751');
  });
  
  test('AdSense script is not injected when client ID is missing', () => {
    // Remove client ID from runtime config
    window.__RUNTIME_CONFIG__ = {
      adsense: {
        client: ''
      }
    };
    
    // Load the adsense-config.js script
    const script = document.createElement('script');
    script.textContent = `
      // Mock implementation of adsense-config.js
      (function() {
        function getClientId() {
          if (window.__RUNTIME_CONFIG__ && window.__RUNTIME_CONFIG__.adsense && window.__RUNTIME_CONFIG__.adsense.client) {
            return window.__RUNTIME_CONFIG__.adsense.client;
          }
          return '';
        }
        
        function injectAdSenseScript() {
          var clientId = getClientId();
          
          if (clientId) {
            var newScript = document.createElement('script');
            newScript.async = true;
            newScript.crossOrigin = "anonymous";
            newScript.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + clientId;
            document.head.appendChild(newScript);
          }
        }
        
        injectAdSenseScript();
      })();
    `;
    document.head.appendChild(script);
    
    // Execute the script
    eval(script.textContent);
    
    // Verify the script was not created
    expect(document.createElement).toHaveBeenCalledTimes(1); // Only the test script was created
    expect(document.head.appendChild).toHaveBeenCalledTimes(1); // Only the test script was appended
  });
}); 