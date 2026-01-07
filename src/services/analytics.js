/**
 * Google Analytics 4 tracking utility
 * Only tracks in production environment
 */

const GA_MEASUREMENT_ID = 'G-46KBN1JF5T';

/**
 * Check if gtag is available and we're in production
 */
const isTrackingEnabled = () => {
  return (
    typeof window !== 'undefined' &&
    typeof window.gtag === 'function' &&
    process.env.NODE_ENV === 'production'
  );
};

/**
 * Track a page view
 * @param {string} path - The page path (e.g., '/about-us')
 * @param {string} title - The page title
 */
export const trackPageView = (path, title) => {
  if (!isTrackingEnabled()) {
    console.log('[Analytics Dev] Page view:', path, title);
    return;
  }

  window.gtag('config', GA_MEASUREMENT_ID, {
    page_path: path,
    page_title: title,
  });
};

/**
 * Track a button click event
 * @param {string} buttonName - Name/label of the button
 * @param {string} category - Category of the action (e.g., 'email', 'navigation', 'donate')
 * @param {object} additionalParams - Optional additional parameters
 */
export const trackButtonClick = (buttonName, category = 'engagement', additionalParams = {}) => {
  if (!isTrackingEnabled()) {
    console.log('[Analytics Dev] Button click:', buttonName, category, additionalParams);
    return;
  }

  window.gtag('event', 'click', {
    event_category: category,
    event_label: buttonName,
    ...additionalParams,
  });
};

/**
 * Track a custom event
 * @param {string} eventName - Name of the event
 * @param {object} params - Event parameters
 */
export const trackEvent = (eventName, params = {}) => {
  if (!isTrackingEnabled()) {
    console.log('[Analytics Dev] Event:', eventName, params);
    return;
  }

  window.gtag('event', eventName, params);
};

/**
 * Predefined tracking functions for common actions
 */
export const analytics = {
  // Email actions
  generateEmail: () => trackButtonClick('Generate Email', 'email'),
  changeEmail: () => trackButtonClick('Change Email Address', 'email'),
  checkMessages: () => trackButtonClick('Check Messages', 'email'),
  copyEmail: () => trackButtonClick('Copy Email', 'email'),
  
  // Domain selection
  selectDomain: (domain) => trackEvent('select_domain', { domain }),
  
  // Message actions
  selectMessage: (messageId) => trackEvent('select_message', { message_id: messageId }),
  forwardEmail: () => trackButtonClick('Forward Email', 'email'),
  
  // Navigation
  navigateTo: (page) => trackButtonClick(page, 'navigation'),
  
  // Donate
  donateClick: () => trackButtonClick('Donate', 'donate'),
  
  // Other
  toggleTheme: (theme) => trackEvent('toggle_theme', { theme }),
  cookieConsent: (accepted) => trackEvent('cookie_consent', { accepted }),
};

export default analytics;

