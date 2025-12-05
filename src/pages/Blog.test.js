import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Blog from './Blog';
import blogPosts from '../data/blogPosts';

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

  test('renders all blog post cards dynamically from data', () => {
    render(
      <BrowserRouter>
        <Blog />
      </BrowserRouter>
    );
    
    // Test that all blog posts from the data source are rendered
    blogPosts.forEach(post => {
      expect(screen.getByText(post.title)).toBeInTheDocument();
    });
  });

  test('renders read more links for each post', () => {
    render(
      <BrowserRouter>
        <Blog />
      </BrowserRouter>
    );
    
    const readMoreLinks = screen.getAllByText('Read More →');
    expect(readMoreLinks).toHaveLength(blogPosts.length);
    
    // Check that each link points to the correct route based on post id
    blogPosts.forEach((post, index) => {
      expect(readMoreLinks[index].closest('a')).toHaveAttribute('href', `/blog/${post.id}`);
    });
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