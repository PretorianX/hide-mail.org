import React from 'react';
import PropTypes from 'prop-types';
import ContentAwareAd from './ContentAwareAd';
import { useLicense } from '../context/LicenseContext';

/**
 * An ad placement: the wrapper carries where the ad sits on the page, the ad carries itself.
 *
 * The "Advertisement" label is drawn by CSS on `.ad-container`, and the AdContainer this renders
 * already has that class, so the wrapper must not repeat it or every slot is labelled twice. A Pro
 * user gets nothing at all, since an empty wrapper would still take its placement margin.
 */
const AdSlot = ({ className = '', ...adProps }) => {
  const { isPro } = useLicense();

  if (isPro) {
    return null;
  }

  return (
    <div {...(className ? { className } : {})} data-testid="ad-slot">
      <ContentAwareAd {...adProps} />
    </div>
  );
};

AdSlot.propTypes = {
  slot: PropTypes.string.isRequired,
  className: PropTypes.string,
};

export default AdSlot;
