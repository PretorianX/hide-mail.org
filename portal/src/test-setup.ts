import '@testing-library/jest-dom';
import { webcrypto } from 'node:crypto';

// jsdom may lack Web Crypto randomUUID / fetch; page tests assign fetch mocks.
Object.defineProperty(globalThis, 'crypto', {
  value: webcrypto,
  configurable: true,
});

if (typeof globalThis.fetch !== 'function') {
  globalThis.fetch = jest.fn();
}
