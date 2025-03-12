import React from 'react';
import ContentAwareAd from './ContentAwareAd';
import styled from 'styled-components';

const AdWrapper = styled.div`
  width: 100%;
  margin: 20px 0;
  display: flex;
  justify-content: center;
  align-items: center;
`;

/**
 * PageAds component that displays advertisements above and below the main content
 * 
 * @param {Object} props - Component props
 * @param {string} props.position - Position of the ad (top or bottom)
 * @param {string} props.slot - The ad unit slot ID
 */
const PageAds = ({ position, slot }) => {
  // Different ad formats based on position
  const adConfig = {
    top: {
      width: 728,
      height: 90,
      format: 'horizontal',
      className: 'ad-top-banner'
    },
    bottom: {
      width: 728,
      height: 90,
      format: 'horizontal',
      className: 'ad-bottom-banner'
    }
  };

  const config = adConfig[position] || adConfig.top;

  return (
    <AdWrapper className={`page-ad page-ad-${position}`}>
      <ContentAwareAd
        slot={slot}
        format={config.format}
        width={config.width}
        height={config.height}
        position={position}
        contentSelector="#root"
        minContentLength={300}
        className={config.className}
      />
    </AdWrapper>
  );
};

export default PageAds; 