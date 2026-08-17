import React from 'react';
import PropTypes from 'prop-types';
import ProCta from './ProCta';
import './AdBlockDonateMessage.css';

/**
 * Shown in ad slots when adblock is detected. Sells Pro instead of PayPal donate.
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
        <h3 className="adblock-title">Ad Blocker Detected</h3>
        <p className="adblock-text">
          Ads fund the free inbox. Disable your blocker, or go Pro — no ads, longer addresses.
        </p>
        <ProCta className="adblock-donate-button" compact />
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
