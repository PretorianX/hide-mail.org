import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ThemeProvider, useTheme } from './styles/ThemeContext';

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: jest.fn(key => store[key] || null),
    setItem: jest.fn((key, value) => {
      store[key] = value.toString();
    }),
    clear: jest.fn(() => {
      store = {};
    }),
    removeItem: jest.fn(key => {
      delete store[key];
    }),
  };
})();

// Apply localStorage mock before tests
beforeAll(() => {
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true
  });

  // Create a mock implementation of matchMedia
  window.matchMedia = jest.fn().mockImplementation(query => {
    return {
      matches: false, // Default to light mode
      media: query,
      onchange: null,
      addListener: jest.fn(), // Deprecated
      removeListener: jest.fn(), // Deprecated
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    };
  });
});

// Test component that uses the theme context
const TestComponent = () => {
  const { theme, toggleTheme } = useTheme();
  return (
    <div>
      <div data-testid="theme-value">{theme}</div>
      <button data-testid="toggle-button" onClick={toggleTheme}>
        Toggle Theme
      </button>
    </div>
  );
};

describe('ThemeContext', () => {
  beforeEach(() => {
    // Clear localStorage mock
    localStorageMock.clear();
    jest.clearAllMocks();
    
    // Reset matchMedia to default (light mode)
    window.matchMedia.mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
  });

  test('provides light theme by default when no preference is set', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );
    
    expect(screen.getByTestId('theme-value').textContent).toBe('light');
  });

  test('toggles theme when toggle button is clicked', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );
    
    // Initial theme should be light
    expect(screen.getByTestId('theme-value').textContent).toBe('light');
    
    // Click toggle button
    fireEvent.click(screen.getByTestId('toggle-button'));
    
    // Theme should now be dark
    expect(screen.getByTestId('theme-value').textContent).toBe('dark');
    
    // Click toggle button again
    fireEvent.click(screen.getByTestId('toggle-button'));
    
    // Theme should be back to light
    expect(screen.getByTestId('theme-value').textContent).toBe('light');
  });

  test('uses saved theme from localStorage if available', () => {
    // Set theme in localStorage before rendering
    localStorageMock.getItem.mockReturnValue('dark');
    
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );
    
    // Theme should be dark as set in localStorage
    expect(screen.getByTestId('theme-value').textContent).toBe('dark');
  });

  test('respects system preference when no saved theme', () => {
    // Mock system preference to dark
    window.matchMedia.mockImplementation(query => ({
      matches: query === '(prefers-color-scheme: dark)',
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
    
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );
    
    // Theme should be dark based on system preference
    expect(screen.getByTestId('theme-value').textContent).toBe('dark');
  });

  test('saves theme to localStorage when toggled', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );
    
    // Click toggle button to change theme to dark
    fireEvent.click(screen.getByTestId('toggle-button'));
    
    // Check if localStorage was updated
    expect(localStorageMock.setItem).toHaveBeenCalledWith('theme', 'dark');
  });
}); 