import { withOptimizedImages } from './blogContent';

describe('withOptimizedImages', () => {
  test('adds lazy loading and async decoding to every image', () => {
    const html = withOptimizedImages(
      '<p>Intro</p><img src="/images/blog/a.jpg" alt="A" /><img src="/images/blog/b.jpg" alt="B" />'
    );

    expect(html.match(/loading="lazy"/g)).toHaveLength(2);
    expect(html.match(/decoding="async"/g)).toHaveLength(2);
  });

  test('preserves the authored source and alt text', () => {
    const html = withOptimizedImages(
      '<img src="/images/blog/temp-email-concept.jpg" alt="Concept illustration of temporary email" />'
    );

    expect(html).toContain('src="/images/blog/temp-email-concept.jpg"');
    expect(html).toContain('alt="Concept illustration of temporary email"');
  });

  test('leaves markup without images untouched', () => {
    const html = withOptimizedImages('<h2>Title</h2><p>Body copy with <strong>bold</strong>.</p>');

    expect(html).toBe('<h2>Title</h2><p>Body copy with <strong>bold</strong>.</p>');
  });
});
