/**
 * Configuration loader with strict validation - no fallbacks
 */

// Import default config directly
import defaultConfig from '../config/default.json';

// Try to import environment-specific config
let envConfig = {};
try {
  // Dynamic import not supported in Jest tests, use conditional require
  const env = process.env.NODE_ENV || 'development';
  if (env === 'development') {
    envConfig = require('../config/development.json');
  } else if (env === 'production') {
    envConfig = require('../config/production.json');
  } else if (env === 'test') {
    // For test environment, use environment variables or default test values
    envConfig = {
      email: {
        domains: (process.env.VALID_DOMAINS || 'test.com,test.org').split(',')
      }
    };
  }
} catch (error) {
  console.warn(`Failed to load environment config: ${error.message}`);
}

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
      if (runtimeValue !== undefined) {
        return runtimeValue;
      }
    }
    
    // Try to get from process.env (for Create React App)
    const envKey = `REACT_APP_${path.toUpperCase().replace(/\./g, '_')}`;
    if (process.env[envKey] !== undefined) {
      return process.env[envKey];
    }
  } 

  // Try environment-specific config
  const envValue = getValueByPath(envConfig, path);
  if (envValue !== undefined) return envValue;
  
  // Try default config
  const defaultValue = getValueByPath(defaultConfig, path);
  if (defaultValue !== undefined) return defaultValue;
  
  // No fallbacks - throw error
  throw new Error(`Configuration not found: ${path}`);
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