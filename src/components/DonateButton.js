import React, { useEffect, useRef } from 'react';
import './DonateButton.css';

const PAYPAL_BUTTON_ID = 'ES5RX8BKH3P5G';
const PAYPAL_SDK_URL = 'https://www.paypalobjects.com/donate/sdk/donate-sdk.js';

// Track if SDK is loaded globally
let sdkLoaded = false;
let sdkLoadPromise = null;

const loadPayPalSDK = () => {
  if (sdkLoaded) {
    return Promise.resolve();
  }
  
  if (sdkLoadPromise) {
    return sdkLoadPromise;
  }
  
  sdkLoadPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${PAYPAL_SDK_URL}"]`);
    if (existingScript) {
      sdkLoaded = true;
      resolve();
      return;
    }
    
    const script = document.createElement('script');
    script.src = PAYPAL_SDK_URL;
    script.charset = 'UTF-8';
    script.async = true;
    script.onload = () => {
      sdkLoaded = true;
      resolve();
    };
    script.onerror = reject;
    document.body.appendChild(script);
  });
  
  return sdkLoadPromise;
};

const DonateButton = ({ className = '' }) => {
  const containerRef = useRef(null);
  const buttonId = useRef(`donate-button-${Math.random().toString(36).substr(2, 9)}`);
  
  useEffect(() => {
    let mounted = true;
    
    const renderButton = async () => {
      try {
        await loadPayPalSDK();
        
        if (!mounted || !containerRef.current) return;
        
        // Clear any existing button
        containerRef.current.innerHTML = '';
        
        // Wait for PayPal to be available
        if (window.PayPal && window.PayPal.Donation) {
          window.PayPal.Donation.Button({
            env: 'production',
            hosted_button_id: PAYPAL_BUTTON_ID,
            image: {
              src: 'https://www.paypalobjects.com/en_US/i/btn/btn_donate_SM.gif',
              alt: 'Donate with PayPal button',
              title: 'PayPal - The safer, easier way to pay online!',
            }
          }).render(`#${buttonId.current}`);
        }
      } catch (error) {
        console.error('Failed to load PayPal SDK:', error);
      }
    };
    
    renderButton();
    
    return () => {
      mounted = false;
    };
  }, []);
  
  return (
    <div className={`donate-button-container ${className}`}>
      <p className="donate-text">Support Hide Mail</p>
      <div id={buttonId.current} ref={containerRef} className="donate-button"></div>
    </div>
  );
};

export default DonateButton;

