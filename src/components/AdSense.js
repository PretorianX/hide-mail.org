import React, { useEffect, useState } from 'react';
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
  // Use state to track the client ID so we can update it if it changes
  const [clientId, setClientId] = useState('');
  
  // Get client ID from runtime config if available, fallback to process.env
  const getClientId = () => {
    if (typeof window !== 'undefined' && 
        window.__RUNTIME_CONFIG__ && 
        window.__RUNTIME_CONFIG__.adsense && 
        window.__RUNTIME_CONFIG__.adsense.client) {
      return window.__RUNTIME_CONFIG__.adsense.client;
    }
    return process.env.REACT_APP_ADSENSE_CLIENT || '';
  };
  
  // Update client ID when component mounts and whenever runtime config changes
  useEffect(() => {
    // Set initial client ID
    setClientId(getClientId());
    
    // Set up an interval to check for changes to the client ID
    const intervalId = setInterval(() => {
      const newClientId = getClientId();
      if (newClientId !== clientId && newClientId !== '') {
        setClientId(newClientId);
      }
    }, 1000); // Check every second
    
    // Clean up interval on unmount
    return () => clearInterval(intervalId);
  }, [clientId]);
  
  useEffect(() => {
    // Only add the script if we're in production and have a client ID
    if (process.env.NODE_ENV === 'production' && clientId) {
      try {
        // For manual ads, push the ad
        if (!autoAd) {
          (window.adsbygoogle = window.adsbygoogle || []).push({});
        }
        // Note: For auto ads, we don't need to do anything here as the script
        // with the client parameter will automatically enable auto ads
      } catch (error) {
        console.error('AdSense error:', error);
      }
    }
  }, [clientId, autoAd]);

  // Don't render anything in development mode
  if (process.env.NODE_ENV !== 'production' || !clientId) {
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
        AdSense {autoAd ? 'Auto Ad' : 'Manual Ad'} Placeholder (Client ID: {clientId || 'Not configured'})
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
      data-ad-client={clientId}
      data-ad-slot={slot}
      data-ad-format={format}
      data-full-width-responsive={responsive.toString()}
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