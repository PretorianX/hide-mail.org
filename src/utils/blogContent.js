/**
 * Applies performance attributes to images inside authored blog HTML.
 *
 * The blog content lives as HTML strings in the data file, so the attributes cannot be
 * set in JSX. Parsing instead of string patching keeps the authored markup — including
 * alt text and image paths — exactly as written.
 */
export const withOptimizedImages = (html) => {
  const document = new DOMParser().parseFromString(html, 'text/html');

  document.querySelectorAll('img').forEach((image) => {
    image.setAttribute('loading', 'lazy');
    image.setAttribute('decoding', 'async');
  });

  return document.body.innerHTML;
};
