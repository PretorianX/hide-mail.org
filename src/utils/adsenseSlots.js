/**
 * AdSense Slot IDs Configuration Utility
 * 
 * This utility provides access to AdSense slot IDs from environment variables
 * or configuration files, preventing hardcoded values in source code.
 * 
 * Slot IDs should be configured via environment variables:
 * - REACT_APP_ADSENSE_SLOT_TOP_BANNER
 * - REACT_APP_ADSENSE_SLOT_TOP_PAGE_AD
 * - REACT_APP_ADSENSE_SLOT_BOTTOM_PAGE_AD
 * - REACT_APP_ADSENSE_SLOT_SIDEBAR_RECTANGLE
 * - REACT_APP_ADSENSE_SLOT_MIDDLE_BANNER
 * - REACT_APP_ADSENSE_SLOT_BEFORE_FOOTER
 * - REACT_APP_ADSENSE_SLOT_FOOTER
 * - REACT_APP_ADSENSE_SLOT_BLOG_TOP
 * - REACT_APP_ADSENSE_SLOT_BLOG_BOTTOM
 * - REACT_APP_ADSENSE_SLOT_BLOG_POST_TOP
 * - REACT_APP_ADSENSE_SLOT_BLOG_POST_MIDDLE
 * - REACT_APP_ADSENSE_SLOT_BLOG_POST_BOTTOM
 */

import { getConfig } from './configLoader';

/**
 * Convert camelCase slot name to environment variable format
 * e.g., 'topBanner' -> 'TOP_BANNER'
 */
function slotNameToEnvKey(slotName) {
  return slotName.replace(/([A-Z])/g, '_$1').toUpperCase();
}

/**
 * Get AdSense slot ID from configuration
 * @param {string} slotName - Name of the slot (e.g., 'topBanner', 'sidebarRectangle')
 * @returns {string} Slot ID or empty string if not configured
 */
export function getAdSenseSlot(slotName) {
  try {
    // Try to get from runtime config first
    if (typeof window !== 'undefined' && window.__RUNTIME_CONFIG__) {
      const runtimeSlot = window.__RUNTIME_CONFIG__.adsense?.slots?.[slotName];
      if (runtimeSlot) {
        return runtimeSlot;
      }
    }
    
    // Try environment variable (REACT_APP_ADSENSE_SLOT_*)
    const envKey = `REACT_APP_ADSENSE_SLOT_${slotNameToEnvKey(slotName)}`;
    if (process.env[envKey]) {
      return process.env[envKey];
    }
    
    // Try config loader with adsense.slots path
    try {
      return getConfig(`adsense.slots.${slotName}`);
    } catch (error) {
      // Slot not found in config - return empty string
      console.warn(`AdSense slot '${slotName}' not configured`);
      return '';
    }
  } catch (error) {
    console.warn(`Error getting AdSense slot '${slotName}':`, error);
    return '';
  }
}

/**
 * AdSense slot names mapping
 */
export const AD_SLOTS = {
  TOP_BANNER: 'topBanner',
  TOP_PAGE_AD: 'topPageAd',
  BOTTOM_PAGE_AD: 'bottomPageAd',
  SIDEBAR_RECTANGLE: 'sidebarRectangle',
  MIDDLE_BANNER: 'middleBanner',
  BEFORE_FOOTER: 'beforeFooter',
  FOOTER: 'footer',
  BLOG_TOP: 'blogTop',
  BLOG_BOTTOM: 'blogBottom',
  BLOG_POST_TOP: 'blogPostTop',
  BLOG_POST_MIDDLE: 'blogPostMiddle',
  BLOG_POST_BOTTOM: 'blogPostBottom',
};

