import React from 'react';
import PropTypes from 'prop-types';
import ContentAwareAd from './ContentAwareAd';
import { useLicense } from '../context/LicenseContext';

/**
 * An ad placement together with its compliance label.
 *
 * The "Advertisement" label lives on `.ad-container` in CSS, so a Pro user must not get the
 * wrapper either: hiding only the ad itself would leave a stray label on a paid, ad-free page.
 */
const AdSlot = ({ className = '', ...adProps }) => {
  const { isPro } = useLicense();

  if (isPro) {
    return null;
  }

  return (
    <div className={`ad-container ${className}`.trim()} data-testid="ad-slot">
      <ContentAwareAd {...adProps} />
    </div>
  );
};

AdSlot.propTypes = {
  slot: PropTypes.string.isRequired,
  className: PropTypes.string,
};

export default AdSlot;
