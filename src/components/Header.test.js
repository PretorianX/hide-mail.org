import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Header from './Header';

describe('Header Component', () => {
  test('renders header with logo and navigation links', () => {
    render(
      <BrowserRouter>
        <Header />
      </BrowserRouter>
    );
    
    // Check for logo text
    expect(screen.getByText('Hide Mail')).toBeInTheDocument();
    expect(screen.getByText('Your friendly temporary email service')).toBeInTheDocument();
    expect(screen.getByText('A mail-duck.com service')).toBeInTheDocument();
    
    // Check for navigation links
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('About')).toBeInTheDocument();
    expect(screen.getByText('Contact')).toBeInTheDocument();
    
    // Check that links have correct hrefs
    expect(screen.getByText('Home').closest('a')).toHaveAttribute('href', '/');
    expect(screen.getByText('About').closest('a')).toHaveAttribute('href', '/about');
    expect(screen.getByText('Contact').closest('a')).toHaveAttribute('href', '/contact');
    
    // Check that mail-duck.com link exists and has correct href
    expect(screen.getByText('A mail-duck.com service').closest('a')).toHaveAttribute('href', 'https://mail-duck.com');
  });
}); 