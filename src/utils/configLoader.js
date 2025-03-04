/**
 * Configuration loader with strict validation - no fallbacks
 */

/**
 * Get configuration value - throws error if not found
 * @param {string} path - Dot notation path to config value (e.g., 'email.domains')
 * @returns {any} Configuration value
 * @throws {Error} If configuration value is not found
 */
export function getConfig(path) {
  // In browser environment
  if (typeof window !== 'undefined') {
    // Try to get from runtime config
    if (window.__RUNTIME_CONFIG__) {
      const runtimeValue = getValueByPath(window.__RUNTIME_CONFIG__, path);
      if (runtimeValue !== undefined) return runtimeValue;
    }
    
    // Try to get from process.env (for Create React App)
    const envKey = `REACT_APP_${path.toUpperCase().replace(/\./g, '_')}`;
    if (process.env[envKey] !== undefined) {
      return process.env[envKey];
    }
    
    // No fallbacks - throw error
    throw new Error(`Configuration not found: ${path}`);
  } 
  // In Node.js environment
  else if (typeof process !== 'undefined') {
    try {
      // Try to load from config files using Node.js require
      const env = process.env.NODE_ENV || 'development';
      const config = require(`../../../config/${env}.json`);
      const value = getValueByPath(config, path);
      if (value !== undefined) return value;
      
      // Try default config
      const defaultConfigFile = require('../../../config/default.json');
      const defaultValue = getValueByPath(defaultConfigFile, path);
      if (defaultValue !== undefined) return defaultValue;
      
      // No fallbacks - throw error
      throw new Error(`Configuration not found in config files: ${path}`);
    } catch (error) {
      // Re-throw with clear message
      throw new Error(`Failed to load configuration for ${path}: ${error.message}`);
    }
  }
  
  // If we get here, we're in an unknown environment
  throw new Error(`Cannot determine environment to load configuration for: ${path}`);
}

/**
 * Get value from object by dot notation path
 * @param {object} obj - Object to get value from
 * @param {string} path - Dot notation path (e.g., 'email.domains')
 * @returns {any} Value at path or undefined if not found
 */
function getValueByPath(obj, path) {
  return path.split('.').reduce((prev, curr) => {
    return prev && prev[curr] !== undefined ? prev[curr] : undefined;
  }, obj);
} 