import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import AdContainer from './AdContainer';

/**
 * ContentAwareAd component that only shows ads when there's sufficient content on the page
 * This helps comply with Google AdSense policies that prohibit showing ads on pages without content
 * 
 * @param {Object} props - Component props
 * @param {string} props.slot - The ad unit slot ID
 * @param {string} props.format - Ad format (auto, rectangle, horizontal, vertical)
 * @param {number} props.width - Width of the ad container in pixels
 * @param {number} props.height - Height of the ad container in pixels
 * @param {string} props.position - Position of the ad (sidebar, inline, etc.)
 * @param {string} props.contentSelector - CSS selector for the content element to check
 * @param {number} props.minContentLength - Minimum content length (in characters) required to show the ad
 */
const ContentAwareAd = ({
  slot,
  format = 'auto',
  width = 300,
  height = 250,
  position = 'sidebar',
  contentSelector = '#root',
  minContentLength = 500
}) => {
  const [hasContent, setHasContent] = useState(false);

  useEffect(() => {
    // Check if there's enough content on the page
    const checkContent = () => {
      const contentElement = document.querySelector(contentSelector);
      if (!contentElement) return false;

      // Get the text content and remove whitespace
      const content = contentElement.textContent || '';
      const cleanContent = content.trim();

      // Check if the content is long enough
      return cleanContent.length >= minContentLength;
    };

    // Initial check
    setHasContent(checkContent());

    // Set up a mutation observer to check when content changes
    const observer = new MutationObserver(() => {
      setHasContent(checkContent());
    });

    // Start observing the content element
    const contentElement = document.querySelector(contentSelector);
    if (contentElement) {
      observer.observe(contentElement, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }

    // Clean up the observer on unmount
    return () => {
      observer.disconnect();
    };
  }, [contentSelector, minContentLength]);

  // Only render the ad if there's enough content
  return (
    <AdContainer
      slot={slot}
      format={format}
      width={width}
      height={height}
      position={position}
      contentAvailable={hasContent}
    />
  );
};

ContentAwareAd.propTypes = {
  slot: PropTypes.string.isRequired,
  format: PropTypes.string,
  width: PropTypes.number,
  height: PropTypes.number,
  position: PropTypes.string,
  contentSelector: PropTypes.string,
  minContentLength: PropTypes.number
};

export default ContentAwareAd; 