import React from 'react';
import PropTypes from 'prop-types';
import DonateButton from './DonateButton';
import './AdBlockDonateMessage.css';

/**
 * AdBlockDonateMessage component displayed when adblock is detected
 * Replaces ad banners with a friendly donation request
 * 
 * @param {Object} props - Component props
 * @param {number} props.width - Width of the container in pixels
 * @param {number} props.height - Height of the container in pixels
 * @param {string} props.className - Additional CSS class for the container
 */
const AdBlockDonateMessage = ({ 
  width = 300, 
  height = 250, 
  className = '' 
}) => {
  const containerStyle = {
    width: `${width}px`,
    height: `${height}px`
  };

  return (
    <div 
      className={`adblock-donate-message ${className}`.trim()} 
      style={containerStyle}
      data-testid="adblock-donate-message"
    >
      <div className="adblock-donate-content">
        <div className="adblock-icon">🛡️</div>
        <h3 className="adblock-title">Ad Blocker Detected</h3>
        <p className="adblock-text">
          Please support us by making a small donation to keep this service free!
        </p>
        <DonateButton className="adblock-donate-button" />
      </div>
    </div>
  );
};

AdBlockDonateMessage.propTypes = {
  width: PropTypes.number,
  height: PropTypes.number,
  className: PropTypes.string
};

export default AdBlockDonateMessage;
