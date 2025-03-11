import blogPosts from './blogPosts';

describe('Blog Posts Data', () => {
  test('blog posts array should not be empty', () => {
    expect(blogPosts).toBeDefined();
    expect(Array.isArray(blogPosts)).toBe(true);
    expect(blogPosts.length).toBeGreaterThan(0);
  });

  test('each blog post should have the required properties', () => {
    blogPosts.forEach(post => {
      expect(post).toHaveProperty('id');
      expect(post).toHaveProperty('title');
      expect(post).toHaveProperty('date');
      expect(post).toHaveProperty('image');
      expect(post).toHaveProperty('content');
      
      expect(typeof post.id).toBe('string');
      expect(typeof post.title).toBe('string');
      expect(typeof post.date).toBe('string');
      expect(typeof post.image).toBe('string');
      expect(typeof post.content).toBe('string');
      
      expect(post.id.length).toBeGreaterThan(0);
      expect(post.title.length).toBeGreaterThan(0);
      expect(post.date.length).toBeGreaterThan(0);
      expect(post.image.length).toBeGreaterThan(0);
      expect(post.content.length).toBeGreaterThan(0);
    });
  });

  test('blog post ids should be unique', () => {
    const ids = blogPosts.map(post => post.id);
    const uniqueIds = [...new Set(ids)];
    expect(ids.length).toBe(uniqueIds.length);
  });

  test('blog post content should contain HTML', () => {
    blogPosts.forEach(post => {
      expect(post.content).toMatch(/<[^>]*>/); // Contains at least one HTML tag
    });
  });
}); 