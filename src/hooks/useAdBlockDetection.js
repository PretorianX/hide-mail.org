import { useState, useEffect } from 'react';

/**
 * Hook to detect if the user has an ad blocker enabled
 * Uses multiple detection methods for reliability:
 * 1. Attempts to fetch a common ad script URL
 * 2. Creates a bait element with ad-related class names
 * 
 * @returns {boolean} - true if adblock is detected, false otherwise
 */
const useAdBlockDetection = () => {
  const [adBlockDetected, setAdBlockDetected] = useState(false);

  useEffect(() => {
    const detectAdBlock = async () => {
      let detected = false;

      // Method 1: Try to fetch a known ad-related URL
      try {
        await fetch('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js', {
          method: 'HEAD',
          mode: 'no-cors',
          cache: 'no-store'
        });
      } catch {
        detected = true;
      }

      // Method 2: Create a bait element with ad-related class names
      if (!detected) {
        const baitElement = document.createElement('div');
        baitElement.className = 'adsbox ad-banner ad-placement textads banner-ads';
        baitElement.style.cssText = 'position: absolute; top: -10px; left: -10px; width: 1px; height: 1px;';
        document.body.appendChild(baitElement);

        // Wait a small amount of time for ad blockers to hide the element
        await new Promise(resolve => setTimeout(resolve, 100));

        // Check if the element was hidden by an ad blocker
        const isHidden = baitElement.offsetHeight === 0 ||
                        baitElement.offsetWidth === 0 ||
                        baitElement.offsetParent === null ||
                        window.getComputedStyle(baitElement).display === 'none' ||
                        window.getComputedStyle(baitElement).visibility === 'hidden';

        if (isHidden) {
          detected = true;
        }

        baitElement.remove();
      }

      setAdBlockDetected(detected);
    };

    detectAdBlock();
  }, []);

  return adBlockDetected;
};

export default useAdBlockDetection;
