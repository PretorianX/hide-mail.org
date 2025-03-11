import React from 'react';
import { render } from '@testing-library/react';
import CookieConsent from './CookieConsent';

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  clear: jest.fn(),
  removeItem: jest.fn()
};

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Simple test to verify the component renders
test('CookieConsent component renders correctly', () => {
  // Mock localStorage to return null for cookieConsentGiven
  localStorageMock.getItem.mockReturnValueOnce(null);
  
  // Just check that the component renders without errors
  expect(() => render(<CookieConsent />)).not.toThrow();
}); 