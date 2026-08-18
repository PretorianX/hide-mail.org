import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ThemeToggle from './ThemeToggle';
import { ThemeProvider } from '../styles/ThemeContext';
import { HEADER_INK } from '../styles/headerInk';

const toRgb = hex => `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
const asRgb = value => (value.startsWith('#') ? toRgb(value) : value);

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
});

// Reset localStorage mock before each test
beforeEach(() => {
  localStorageMock.clear();
});

describe('ThemeToggle Component', () => {
  test('renders with correct initial state (light mode)', () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );
    
    // In light mode, the button should have a moon icon (for switching to dark)
    const toggleButton = screen.getByRole('button');
    expect(toggleButton).toHaveAttribute('aria-label', 'Switch to dark mode');
    expect(toggleButton).toHaveAttribute('title', 'Switch to dark mode');
  });

  test('toggles theme when clicked', () => {
    // Mock document.body.dataset
    Object.defineProperty(document.body, 'dataset', {
      value: { theme: 'light' },
      writable: true
    });

    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );
    
    const toggleButton = screen.getByRole('button');
    
    // Click to toggle to dark mode
    fireEvent.click(toggleButton);
    
    // Check if localStorage was updated
    expect(localStorageMock.setItem).toHaveBeenCalledWith('theme', 'dark');
    
    // Check if button now shows sun icon (for switching to light)
    expect(toggleButton).toHaveAttribute('aria-label', 'Switch to light mode');
    expect(toggleButton).toHaveAttribute('title', 'Switch to light mode');
    
    // Check if body dataset was updated
    expect(document.body.dataset.theme).toBe('dark');
    
    // Click again to toggle back to light mode
    fireEvent.click(toggleButton);
    
    // Check if localStorage was updated again
    expect(localStorageMock.setItem).toHaveBeenCalledWith('theme', 'light');
    
    // Check if button now shows moon icon again
    expect(toggleButton).toHaveAttribute('aria-label', 'Switch to dark mode');
    expect(toggleButton).toHaveAttribute('title', 'Switch to dark mode');
    
    // Check if body dataset was updated again
    expect(document.body.dataset.theme).toBe('light');
  });

  test('initializes with dark mode if saved in localStorage', () => {
    // Set localStorage to have dark theme
    localStorageMock.getItem.mockImplementation(key => {
      if (key === 'theme') return 'dark';
      return null;
    });
    
    // Mock document.body.dataset
    Object.defineProperty(document.body, 'dataset', {
      value: { theme: 'dark' },
      writable: true
    });

    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );
    
    // In dark mode, the button should have a sun icon (for switching to light)
    const toggleButton = screen.getByRole('button');
    expect(toggleButton).toHaveAttribute('aria-label', 'Switch to light mode');
    expect(toggleButton).toHaveAttribute('title', 'Switch to light mode');
  });

  test('paints its glyph and its ring in the dark header ink', () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );

    const styles = window.getComputedStyle(screen.getByRole('button'));
    expect(styles.color).toBe(toRgb(HEADER_INK));
    // jsdom leaves a colour that came from the `border` shorthand in its authored hex form.
    expect(asRgb(styles.borderColor)).toBe(toRgb(HEADER_INK));
  });
});
