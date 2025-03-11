import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Blog from './Blog';

// Mock the ContentAwareAd component
jest.mock('../components/ContentAwareAd', () => {
  return function MockContentAwareAd(props) {
    const { contentSelector, minContentLength, ...otherProps } = props;
    return (
      <div 
        data-testid="content-aware-ad" 
        data-contentselector={contentSelector}
        data-mincontentlength={minContentLength}
        {...otherProps} 
      />
    );
  };
});

describe('Blog Component', () => {
  test('renders blog title and description', () => {
    render(
      <BrowserRouter>
        <Blog />
      </BrowserRouter>
    );
    
    expect(screen.getByText('Hide Mail Blog')).toBeInTheDocument();
    expect(screen.getByText(/Explore our articles about email privacy/i)).toBeInTheDocument();
  });

  test('renders all blog post cards', () => {
    render(
      <BrowserRouter>
        <Blog />
      </BrowserRouter>
    );
    
    expect(screen.getByText('What Are Temporary Email Addresses and How Do They Work?')).toBeInTheDocument();
    expect(screen.getByText('Email Privacy: Why It Matters and How to Protect It')).toBeInTheDocument();
    expect(screen.getByText('Email Security Best Practices')).toBeInTheDocument();
    expect(screen.getByText('The Legal Side of Email Privacy: What You Need to Know')).toBeInTheDocument();
  });

  test('renders read more links for each post', () => {
    render(
      <BrowserRouter>
        <Blog />
      </BrowserRouter>
    );
    
    const readMoreLinks = screen.getAllByText('Read More →');
    expect(readMoreLinks).toHaveLength(4);
    
    // Check that links point to the correct routes
    expect(readMoreLinks[0].closest('a')).toHaveAttribute('href', '/blog/temporary-email-guide');
    expect(readMoreLinks[1].closest('a')).toHaveAttribute('href', '/blog/email-privacy');
    expect(readMoreLinks[2].closest('a')).toHaveAttribute('href', '/blog/email-security-best-practices');
    expect(readMoreLinks[3].closest('a')).toHaveAttribute('href', '/blog/legal-side-of-email-privacy');
  });

  test('renders ContentAwareAd components', () => {
    render(
      <BrowserRouter>
        <Blog />
      </BrowserRouter>
    );
    
    const adComponents = screen.getAllByTestId('content-aware-ad');
    expect(adComponents).toHaveLength(2);
  });
}); 