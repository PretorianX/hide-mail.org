import React from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import './ProCta.css';

const ProCta = ({ className = '', compact = false }) => (
  <div className={`pro-cta ${compact ? 'pro-cta-compact' : ''} ${className}`.trim()}>
    <p className="pro-cta-text">
      {compact
        ? 'Keep this inbox with Hide Mail Pro'
        : 'Ads keep Hide Mail free. Go Pro for no ads, longer inboxes, custom aliases and premium domains.'}
    </p>
    <Link to="/pro" className="pro-cta-button" data-testid="pro-cta-link">
      Get Hide Mail Pro
    </Link>
  </div>
);

ProCta.propTypes = {
  className: PropTypes.string,
  compact: PropTypes.bool,
};

export default ProCta;
