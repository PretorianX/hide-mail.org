import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Header from './Header';
import { ThemeProvider } from '../styles/ThemeContext';

describe('Header Component', () => {
  test('renders header with logo and navigation links', () => {
    render(
      <ThemeProvider>
        <BrowserRouter>
          <Header />
        </BrowserRouter>
      </ThemeProvider>
    );
    
    // Check for logo text
    expect(screen.getByText('Hide Mail')).toBeInTheDocument();
    expect(screen.getByText('Your friendly temporary email service')).toBeInTheDocument();
    
    // Check for navigation links
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Blog')).toBeInTheDocument();
    expect(screen.getByText('About')).toBeInTheDocument();
    expect(screen.getByText('Contact')).toBeInTheDocument();
    
    // Check that links have correct hrefs
    expect(screen.getByText('Home').closest('a')).toHaveAttribute('href', '/');
    expect(screen.getByText('Blog').closest('a')).toHaveAttribute('href', '/blog');
    expect(screen.getByText('About').closest('a')).toHaveAttribute('href', '/about-us');
    expect(screen.getByText('Contact').closest('a')).toHaveAttribute('href', '/contact-us');
    
    // Check that theme toggle button is present
    expect(screen.getByRole('button', { name: /switch to (dark|light) mode/i })).toBeInTheDocument();
  });
}); 