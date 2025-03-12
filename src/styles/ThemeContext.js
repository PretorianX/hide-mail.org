import React, { createContext, useState, useEffect, useContext } from 'react';

const ThemeContext = createContext();

// Custom hook to use the theme context
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  // Check if user has previously set a theme preference
  const getSavedTheme = () => {
    try {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme) {
        return savedTheme;
      }
      
      // Check system preference if no saved theme and if matchMedia is available
      if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    } catch (error) {
      console.error('Error accessing localStorage or matchMedia:', error);
    }
    
    return 'light';
  };

  const [theme, setTheme] = useState(getSavedTheme);

  // Toggle theme function
  const toggleTheme = () => {
    setTheme(prevTheme => {
      const newTheme = prevTheme === 'light' ? 'dark' : 'light';
      try {
        localStorage.setItem('theme', newTheme);
      } catch (error) {
        console.error('Error saving theme to localStorage:', error);
      }
      return newTheme;
    });
  };

  // Listen for system preference changes if matchMedia is available
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return; // Skip this effect in environments without matchMedia (like tests)
    }
    
    try {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      
      const handleChange = (e) => {
        // Only update if user hasn't manually set a preference
        try {
          if (!localStorage.getItem('theme')) {
            setTheme(e.matches ? 'dark' : 'light');
          }
        } catch (error) {
          console.error('Error accessing localStorage in media query handler:', error);
        }
      };
      
      // Use the appropriate event listener based on browser support
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', handleChange);
      } else if (mediaQuery.addListener) {
        // For older browsers
        mediaQuery.addListener(handleChange);
      }
      
      return () => {
        if (mediaQuery.removeEventListener) {
          mediaQuery.removeEventListener('change', handleChange);
        } else if (mediaQuery.removeListener) {
          // For older browsers
          mediaQuery.removeListener(handleChange);
        }
      };
    } catch (error) {
      console.error('Error setting up media query listener:', error);
      return () => {};
    }
  }, []);

  // Apply theme class to body
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.body.dataset.theme = theme;
    }
    
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('theme', theme);
      }
    } catch (error) {
      console.error('Error saving theme to localStorage:', error);
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export default ThemeContext; 