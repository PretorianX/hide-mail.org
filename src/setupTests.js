// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toBeInTheDocument();
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';
import { webcrypto } from 'crypto';
import { TextEncoder, TextDecoder } from 'util';

// serialize-javascript@7+ calls crypto.getRandomValues at module load.
// Jest's jsdom environment does not expose the Web Crypto API by default.
if (!globalThis.crypto?.getRandomValues) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
    writable: true,
  });
}

// react-router@7 reads TextEncoder at module load. Browsers have it; Jest's jsdom does not.
if (!globalThis.TextEncoder) {
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
}

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
