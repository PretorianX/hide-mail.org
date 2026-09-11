import React from 'react';
import PropTypes from 'prop-types';
import { PAYPAL_ORDER_URL } from '../utils/paypal';
import { analytics } from '../services/analytics.js';
import './ProCta.css';

const ProCta = ({ className = '', compact = false }) => (
  <div className={`pro-cta ${compact ? 'pro-cta-compact' : ''} ${className}`.trim()}>
    <p className="pro-cta-text">
      {compact
        ? 'Ads keep this inbox free. Support Hide Mail on PayPal.'
        : 'Ads keep Hide Mail free. Support the project on PayPal while card checkout is paused.'}
    </p>
    <a
      href={PAYPAL_ORDER_URL}
      className="pro-cta-button"
      data-testid="pro-cta-link"
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => analytics.donateClick()}
    >
      Pay with PayPal
    </a>
  </div>
);

ProCta.propTypes = {
  className: PropTypes.string,
  compact: PropTypes.bool,
};

export default ProCta;
