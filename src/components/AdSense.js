import React, { useEffect } from 'react';

const AdSense = ({ slot, format = 'auto', responsive = true, style = {} }) => {
  const client = process.env.REACT_APP_ADSENSE_CLIENT;

  useEffect(() => {
    // Only add the script if we're in production and have a client ID
    if (process.env.NODE_ENV === 'production' && client) {
      try {
        // Wait for adsense script to load
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (error) {
        console.error('AdSense error:', error);
      }
    }
  }, [client]);

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
        AdSense Placeholder (Client ID: {client || 'Not configured'})
      </div>
    );
  }

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

export default AdSense; 