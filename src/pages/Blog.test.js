import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter, MemoryRouter, Routes, Route } from 'react-router';
import Blog from './Blog';
import blogPosts from '../data/blogPosts';
import { cssRulesFor, cssTextFor } from '../test-utils/styledCss';

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

const renderBlog = () =>
  render(
    <BrowserRouter>
      <Blog />
    </BrowserRouter>
  );

const renderBlogWithRoutes = () =>
  render(
    <MemoryRouter initialEntries={['/blog']}>
      <Routes>
        <Route path="/blog" element={<Blog />} />
        <Route path="/blog/:postId" element={<div>post page</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('Blog Component', () => {
  test('renders blog title and description', () => {
    renderBlog();
    
    expect(screen.getByText('Hide Mail Blog')).toBeInTheDocument();
    expect(screen.getByText(/Explore our articles about email privacy/i)).toBeInTheDocument();
  });

  test('renders all blog post cards dynamically from data', () => {
    renderBlog();
    
    // Test that all blog posts from the data source are rendered
    blogPosts.forEach(post => {
      expect(screen.getByText(post.title)).toBeInTheDocument();
    });
  });

  test('renders ContentAwareAd components', () => {
    renderBlog();
    
    const adComponents = screen.getAllByTestId('content-aware-ad');
    expect(adComponents).toHaveLength(2);
  });
});

describe('Blog post cards are clickable', () => {
  test('exposes exactly one link per card, named by the post title', () => {
    renderBlog();

    expect(screen.getAllByRole('link')).toHaveLength(blogPosts.length);

    blogPosts.forEach(post => {
      expect(screen.getByRole('link', { name: post.title })).toHaveAttribute(
        'href',
        `/blog/${post.id}`
      );
    });
  });

  test('renders the read more cue as decoration rather than a second link', () => {
    renderBlog();

    const cues = screen.getAllByText('Read More →');
    expect(cues).toHaveLength(blogPosts.length);
    cues.forEach(cue => {
      expect(cue).toHaveAttribute('aria-hidden', 'true');
    });
  });

  test('stretches the post link across the whole card so the card is one hit target', () => {
    renderBlog();

    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(blogPosts.length);
    expect(cssTextFor(cards[0])).toContain('position: relative');

    const link = screen.getByRole('link', { name: blogPosts[0].title });
    const overlayRule = cssRulesFor(link).find(rule => rule.includes('::after'));
    expect(overlayRule).toEqual(expect.stringContaining('position: absolute'));
    expect(overlayRule).toEqual(expect.stringContaining('inset: 0'));
  });

  test('opens the post when the card link is clicked', async () => {
    const user = userEvent.setup();
    renderBlogWithRoutes();

    await user.click(screen.getByRole('link', { name: blogPosts[0].title }));

    expect(await screen.findByText('post page')).toBeInTheDocument();
  });

  test('gives each card a single tab stop that opens the post on Enter', async () => {
    const user = userEvent.setup();
    renderBlogWithRoutes();

    await user.tab();
    expect(screen.getByRole('link', { name: blogPosts[0].title })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('link', { name: blogPosts[1].title })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('link', { name: blogPosts[2].title })).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(await screen.findByText('post page')).toBeInTheDocument();
  });

  test('shows a focus indicator on the card while the post link has focus', () => {
    renderBlog();

    const cardCss = cssTextFor(screen.getAllByRole('article')[0]);
    expect(cardCss).toContain(':focus-within');
    expect(cardCss).toContain('outline');
  });
});

describe('Blog post cover images', () => {
  test('renders each cover image lazily and asynchronously decoded', () => {
    renderBlog();

    const covers = screen.getAllByRole('presentation');
    expect(covers).toHaveLength(blogPosts.length);

    covers.forEach((cover, index) => {
      expect(cover).toHaveAttribute('src', blogPosts[index].image);
      expect(cover).toHaveAttribute('loading', 'lazy');
      expect(cover).toHaveAttribute('decoding', 'async');
    });
  });

  test('reserves a fixed aspect ratio for cover images to avoid layout shift', () => {
    renderBlog();

    const coverCss = cssTextFor(screen.getAllByRole('presentation')[0]);
    expect(coverCss).toContain('aspect-ratio');
    expect(coverCss).toContain('object-fit: cover');
  });
});
