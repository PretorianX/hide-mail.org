import '@testing-library/jest-dom';
import { webcrypto } from 'node:crypto';
import { TextDecoder, TextEncoder } from 'node:util';

// jsdom may lack Web Crypto randomUUID / fetch; page tests assign fetch mocks.
Object.defineProperty(globalThis, 'crypto', {
  value: webcrypto,
  configurable: true,
});

// react-router@7 reads TextEncoder at module load. Browsers have it; Jest's jsdom does not.
if (!globalThis.TextEncoder) {
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
}

if (typeof globalThis.fetch !== 'function') {
  globalThis.fetch = jest.fn();
}
