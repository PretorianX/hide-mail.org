import {
  hasConsentBeenGiven,
  getCookiePreferences,
  isCookieCategoryAllowed,
  initializeAdSenseWithConsent,
  initializeAnalyticsWithConsent,
  updateCookiePreferences
} from './cookieConsentUtils';

// Mock localStorage
const localStorageMock = (function() {
  let store = {};
  return {
    getItem: jest.fn(key => store[key] || null),
    setItem: jest.fn((key, value) => {
      store[key] = value.toString();
    }),
    clear: jest.fn(() => {
      store = {};
    }),
    removeItem: jest.fn(key => {
      delete store[key];
    })
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Mock window.adsbygoogle
beforeEach(() => {
  window.adsbygoogle = [];
  window.adsbygoogle.push = jest.fn();
});

describe('Cookie Consent Utilities', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    jest.clearAllMocks();
    
    // Reset console.log mock
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('hasConsentBeenGiven', () => {
    test('returns false when no consent has been given', () => {
      localStorage.getItem.mockReturnValueOnce(null);
      expect(hasConsentBeenGiven()).toBe(false);
    });

    test('returns true when consent has been given', () => {
      localStorage.getItem.mockReturnValueOnce('true');
      expect(hasConsentBeenGiven()).toBe(true);
    });
  });

  describe('getCookiePreferences', () => {
    test('returns default preferences when none are stored', () => {
      localStorage.getItem.mockReturnValueOnce(null);
      
      const preferences = getCookiePreferences();
      
      expect(preferences).toEqual({
        necessary: true,
        analytics: false,
        advertising: false,
        functional: false
      });
    });

    test('returns stored preferences when available', () => {
      const storedPreferences = {
        necessary: true,
        analytics: true,
        advertising: false,
        functional: true
      };
      
      localStorage.getItem.mockReturnValueOnce(JSON.stringify(storedPreferences));
      
      const preferences = getCookiePreferences();
      
      expect(preferences).toEqual(storedPreferences);
    });

    test('returns default preferences when stored preferences are invalid', () => {
      localStorage.getItem.mockReturnValueOnce('invalid-json');
      
      const preferences = getCookiePreferences();
      
      expect(preferences).toEqual({
        necessary: true,
        analytics: false,
        advertising: false,
        functional: false
      });
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('isCookieCategoryAllowed', () => {
    test('always allows necessary cookies', () => {
      // Even when no consent is given
      localStorage.getItem.mockReturnValue(null);
      
      expect(isCookieCategoryAllowed('necessary')).toBe(true);
    });

    test('disallows non-necessary cookies when no consent is given', () => {
      localStorage.getItem.mockReturnValue(null);
      
      expect(isCookieCategoryAllowed('analytics')).toBe(false);
      expect(isCookieCategoryAllowed('advertising')).toBe(false);
      expect(isCookieCategoryAllowed('functional')).toBe(false);
    });

    test('checks preferences for non-necessary cookies when consent is given', () => {
      // Mock consent given
      localStorage.getItem.mockImplementation(key => {
        if (key === 'cookieConsentGiven') return 'true';
        if (key === 'cookiePreferences') return JSON.stringify({
          necessary: true,
          analytics: true,
          advertising: false,
          functional: true
        });
        return null;
      });
      
      expect(isCookieCategoryAllowed('analytics')).toBe(true);
      expect(isCookieCategoryAllowed('advertising')).toBe(false);
      expect(isCookieCategoryAllowed('functional')).toBe(true);
    });
  });

  describe('initializeAdSenseWithConsent', () => {
    test('initializes AdSense when advertising cookies are allowed', () => {
      // Mock consent given with advertising allowed
      localStorage.getItem.mockImplementation(key => {
        if (key === 'cookieConsentGiven') return 'true';
        if (key === 'cookiePreferences') return JSON.stringify({
          necessary: true,
          analytics: false,
          advertising: true,
          functional: false
        });
        return null;
      });
      
      initializeAdSenseWithConsent();
      
      expect(window.adsbygoogle.push).toHaveBeenCalled();
      expect(window.adsbygoogle.requestNonPersonalizedAds).toBeUndefined();
    });

    test('sets non-personalized ads when advertising cookies are not allowed', () => {
      // Mock consent given with advertising disallowed
      localStorage.getItem.mockImplementation(key => {
        if (key === 'cookieConsentGiven') return 'true';
        if (key === 'cookiePreferences') return JSON.stringify({
          necessary: true,
          analytics: false,
          advertising: false,
          functional: false
        });
        return null;
      });
      
      initializeAdSenseWithConsent();
      
      expect(window.adsbygoogle.push).not.toHaveBeenCalled();
      expect(window.adsbygoogle.requestNonPersonalizedAds).toBe(1);
    });
  });

  describe('initializeAnalyticsWithConsent', () => {
    test('initializes analytics when analytics cookies are allowed', () => {
      // Mock consent given with analytics allowed
      localStorage.getItem.mockImplementation(key => {
        if (key === 'cookieConsentGiven') return 'true';
        if (key === 'cookiePreferences') return JSON.stringify({
          necessary: true,
          analytics: true,
          advertising: false,
          functional: false
        });
        return null;
      });
      
      initializeAnalyticsWithConsent();
      
      expect(console.log).toHaveBeenCalledWith('Analytics initialized with consent');
    });

    test('does not initialize analytics when analytics cookies are not allowed', () => {
      // Mock consent given with analytics disallowed
      localStorage.getItem.mockImplementation(key => {
        if (key === 'cookieConsentGiven') return 'true';
        if (key === 'cookiePreferences') return JSON.stringify({
          necessary: true,
          analytics: false,
          advertising: false,
          functional: false
        });
        return null;
      });
      
      initializeAnalyticsWithConsent();
      
      expect(console.log).not.toHaveBeenCalled();
    });
  });

  describe('updateCookiePreferences', () => {
    test('updates localStorage and reinitializes services', () => {
      // Mock the initialization functions
      const mockInitAdSense = jest.spyOn({ initializeAdSenseWithConsent }, 'initializeAdSenseWithConsent');
      const mockInitAnalytics = jest.spyOn({ initializeAnalyticsWithConsent }, 'initializeAnalyticsWithConsent');
      
      const newPreferences = {
        necessary: true,
        analytics: true,
        advertising: true,
        functional: false
      };
      
      updateCookiePreferences(newPreferences);
      
      expect(localStorage.setItem).toHaveBeenCalledWith('cookieConsentGiven', 'true');
      expect(localStorage.setItem).toHaveBeenCalledWith('cookiePreferences', JSON.stringify(newPreferences));
    });
  });
}); 