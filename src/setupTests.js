// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toBeInTheDocument();
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Provide test runtime configuration for all tests
global.window.__RUNTIME_CONFIG__ = {
  email: {
    domains: ['hide-mail.org', 'private-mail.org'],
    expirationTime: 1800,
    extensionTime: 900
  },
  api: {
    url: 'http://localhost:3001',
    timeout: 5000
  }
};
