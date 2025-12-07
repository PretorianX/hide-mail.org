import React from 'react';
import PropTypes from 'prop-types';
import AdSense from './AdSense';
import AdBlockDonateMessage from './AdBlockDonateMessage';
import useAdBlockDetection from '../hooks/useAdBlockDetection';
import './AdStyles.css';

/**
 * AdContainer component for wrapping AdSense ads with proper styling
 * Shows donation message when adblock is detected
 * 
 * @param {Object} props - Component props
 * @param {string} props.slot - The ad unit slot ID
 * @param {string} props.format - Ad format (auto, rectangle, horizontal, vertical)
 * @param {number} props.width - Width of the ad container in pixels
 * @param {number} props.height - Height of the ad container in pixels
 * @param {string} props.className - Additional CSS class for the container
 * @param {string} props.position - Position of the ad (sidebar, inline, etc.)
 * @param {boolean} props.contentAvailable - Whether there is sufficient content to display ads
 */
const AdContainer = ({ 
  slot, 
  format = 'auto', 
  width = 300, 
  height = 250, 
  className = '', 
  position = 'sidebar',
  contentAvailable = true
}) => {
  const adBlockDetected = useAdBlockDetection();

  // Determine if this is a horizontal banner (for styling)
  const isHorizontal = format === 'horizontal';
  const isCompact = !isHorizontal && height < 150;
  const adBlockClassName = isHorizontal ? 'horizontal' : (isCompact ? 'compact' : '');

  // Show donate message if adblock is detected (regardless of content availability)
  // The donate button provides value even without other content
  if (adBlockDetected) {
    return (
      <div className={`ad-container ${position ? `ad-${position}` : ''} ${className}`.trim()} data-testid="ad-container">
        <AdBlockDonateMessage 
          width={width} 
          height={height} 
          className={adBlockClassName}
        />
      </div>
    );
  }

  // If no content is available, don't render the ad (only for actual ads, not donate message)
  if (!contentAvailable) {
    return null;
  }

  const containerStyle = {
    width: `${width}px`,
    height: `${height}px`,
    margin: '0 auto',
    overflow: 'hidden',
    backgroundColor: '#f8f9fa',
    border: process.env.NODE_ENV === 'development' ? '1px dashed #ccc' : 'none',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    maxWidth: '100%'
  };

  const containerClass = `ad-container ${position ? `ad-${position}` : ''} ${className}`.trim();

  return (
    <div className={containerClass} style={containerStyle} data-testid="ad-container">
      {process.env.NODE_ENV === 'development' ? (
        <div style={{ textAlign: 'center', color: '#666' }}>
          Google Ad ({width}x{height})
        </div>
      ) : (
        <AdSense
          slot={slot}
          format={format}
          responsive={true}
          style={{ 
            display: 'block',
            width: '100%',
            height: '100%'
          }}
        />
      )}
    </div>
  );
};

AdContainer.propTypes = {
  slot: PropTypes.string.isRequired,
  format: PropTypes.string,
  width: PropTypes.number,
  height: PropTypes.number,
  className: PropTypes.string,
  position: PropTypes.string,
  contentAvailable: PropTypes.bool
};

export default AdContainer; 