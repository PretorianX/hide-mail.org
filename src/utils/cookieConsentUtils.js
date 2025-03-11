/**
 * Cookie consent utility functions
 * These functions help manage cookie consent preferences throughout the application
 */

/**
 * Get the user's cookie consent status
 * @returns {boolean} True if the user has given consent, false otherwise
 */
export const hasConsentBeenGiven = () => {
  return localStorage.getItem('cookieConsentGiven') === 'true';
};

/**
 * Get the user's cookie preferences
 * @returns {Object} The user's cookie preferences
 */
export const getCookiePreferences = () => {
  try {
    const preferences = JSON.parse(localStorage.getItem('cookiePreferences'));
    if (preferences) {
      return preferences;
    }
  } catch (error) {
    console.error('Error parsing cookie preferences:', error);
  }
  
  // Default preferences if none are found
  return {
    necessary: true,
    analytics: false,
    advertising: false,
    functional: false
  };
};

/**
 * Check if a specific cookie category is allowed
 * @param {string} category - The cookie category to check (necessary, analytics, advertising, functional)
 * @returns {boolean} True if the category is allowed, false otherwise
 */
export const isCookieCategoryAllowed = (category) => {
  // Necessary cookies are always allowed
  if (category === 'necessary') {
    return true;
  }
  
  // If no consent has been given, only necessary cookies are allowed
  if (!hasConsentBeenGiven()) {
    return false;
  }
  
  const preferences = getCookiePreferences();
  return preferences[category] === true;
};

/**
 * Initialize AdSense based on cookie consent
 * This function should be called when the application loads
 * It will only initialize AdSense if advertising cookies are allowed
 */
export const initializeAdSenseWithConsent = () => {
  if (isCookieCategoryAllowed('advertising')) {
    // Initialize AdSense
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  } else {
    // Disable AdSense
    window.adsbygoogle = window.adsbygoogle || [];
    window.adsbygoogle.requestNonPersonalizedAds = 1;
  }
};

/**
 * Initialize analytics based on cookie consent
 * This function should be called when the application loads
 * It will only initialize analytics if analytics cookies are allowed
 */
export const initializeAnalyticsWithConsent = () => {
  if (isCookieCategoryAllowed('analytics')) {
    // Initialize analytics (e.g., Google Analytics)
    // This is a placeholder for actual analytics initialization
    console.log('Analytics initialized with consent');
  }
};

/**
 * Update cookie consent preferences
 * @param {Object} preferences - The new cookie preferences
 */
export const updateCookiePreferences = (preferences) => {
  localStorage.setItem('cookieConsentGiven', 'true');
  localStorage.setItem('cookiePreferences', JSON.stringify(preferences));
  
  // Re-initialize services based on new preferences
  initializeAdSenseWithConsent();
  initializeAnalyticsWithConsent();
}; 