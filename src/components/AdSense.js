import React, { useEffect } from 'react';
import PropTypes from 'prop-types';

/**
 * AdSense component for displaying Google AdSense advertisements
 * 
 * @param {Object} props - Component props
 * @param {string} props.slot - The ad unit slot ID (required for manual ads)
 * @param {string} props.format - Ad format (auto, rectangle, horizontal, vertical)
 * @param {boolean} props.responsive - Whether the ad should be responsive
 * @param {Object} props.style - Additional styles for the ad container
 * @param {boolean} props.autoAd - Whether to use Auto ads instead of manual placement
 */
const AdSense = ({ slot, format = 'auto', responsive = true, style = {}, autoAd = false }) => {
  const client = process.env.REACT_APP_ADSENSE_CLIENT;

  useEffect(() => {
    // Only add the script if we're in production and have a client ID
    if (process.env.NODE_ENV === 'production' && client) {
      try {
        // Initialize auto ads if enabled
        if (autoAd) {
          (window.adsbygoogle = window.adsbygoogle || []).push({
            google_ad_client: client,
            enable_page_level_ads: true
          });
        } else {
          // Wait for adsense script to load and push the ad
          (window.adsbygoogle = window.adsbygoogle || []).push({});
        }
      } catch (error) {
        console.error('AdSense error:', error);
      }
    }
  }, [client, autoAd]);

  // Don't render anything in development mode
  if (process.env.NODE_ENV !== 'production' || !client) {
    return (
      <div 
        style={{ 
          display: 'block', 
          backgroundColor: '#f8f9fa', 
          textAlign: 'center',
          padding: '15px',
          border: '1px dashed #ccc',
          ...style
        }}
      >
        AdSense {autoAd ? 'Auto Ad' : 'Manual Ad'} Placeholder (Client ID: {client || 'Not configured'})
      </div>
    );
  }

  // For auto ads, we don't need to render an ins element
  if (autoAd) {
    return null;
  }

  // For manual ads, render the ins element
  return (
    <ins
      className="adsbygoogle"
      style={{ display: 'block', ...style }}
      data-ad-client={client}
      data-ad-slot={slot}
      data-ad-format={format}
      data-full-width-responsive={responsive ? 'true' : 'false'}
    />
  );
};

AdSense.propTypes = {
  slot: PropTypes.string,
  format: PropTypes.string,
  responsive: PropTypes.bool,
  style: PropTypes.object,
  autoAd: PropTypes.bool
};

export default AdSense; 