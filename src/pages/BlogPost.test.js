import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, Routes, Route } from 'react-router-dom';
import BlogPost from './BlogPost';

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

// Mock the blogPosts data
jest.mock('../data/blogPosts', () => [
  {
    id: 'temporary-email-guide',
    title: 'What Are Temporary Email Addresses and How Do They Work?',
    date: 'June 15, 2023',
    image: '/images/blog/temporary-email-guide.jpg',
    content: '<p>This is test content for the temporary email guide.</p>'
  },
  {
    id: 'email-privacy',
    title: 'Email Privacy: Why It Matters and How to Protect It',
    date: 'July 2, 2023',
    image: '/images/blog/email-privacy.jpg',
    content: '<p>This is test content for the email privacy article.</p>'
  }
]);

describe('BlogPost Component', () => {
  test('renders blog post content when post exists', () => {
    render(
      <MemoryRouter initialEntries={['/blog/temporary-email-guide']}>
        <Routes>
          <Route path="/blog/:postId" element={<BlogPost />} />
        </Routes>
      </MemoryRouter>
    );
    
    expect(screen.getByText('What Are Temporary Email Addresses and How Do They Work?')).toBeInTheDocument();
    expect(screen.getByText('June 15, 2023')).toBeInTheDocument();
    expect(screen.getByText('This is test content for the temporary email guide.')).toBeInTheDocument();
    expect(screen.getByText('Back to Blog')).toBeInTheDocument();
  });

  test('renders related posts section', () => {
    render(
      <MemoryRouter initialEntries={['/blog/temporary-email-guide']}>
        <Routes>
          <Route path="/blog/:postId" element={<BlogPost />} />
        </Routes>
      </MemoryRouter>
    );
    
    expect(screen.getByText('Related Articles')).toBeInTheDocument();
    expect(screen.getByText('Email Privacy: Why It Matters and How to Protect It')).toBeInTheDocument();
  });

  test('renders not found message when post does not exist', () => {
    render(
      <MemoryRouter initialEntries={['/blog/non-existent-post']}>
        <Routes>
          <Route path="/blog/:postId" element={<BlogPost />} />
        </Routes>
      </MemoryRouter>
    );
    
    expect(screen.getByText('Blog Post Not Found')).toBeInTheDocument();
    expect(screen.getByText("Sorry, the blog post you're looking for doesn't exist or has been moved.")).toBeInTheDocument();
    expect(screen.getByText('Return to Blog')).toBeInTheDocument();
  });

  test('renders ContentAwareAd components', () => {
    render(
      <MemoryRouter initialEntries={['/blog/temporary-email-guide']}>
        <Routes>
          <Route path="/blog/:postId" element={<BlogPost />} />
        </Routes>
      </MemoryRouter>
    );
    
    const adComponents = screen.getAllByTestId('content-aware-ad');
    expect(adComponents).toHaveLength(3);
  });
}); 