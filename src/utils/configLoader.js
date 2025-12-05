/**
 * Configuration loader - uses runtime config and environment variables only
 * No JSON fallbacks - all config must be provided via env vars or runtime config
 */

/**
 * Get configuration value - throws error if not found
 * @param {string} path - Dot notation path to config value (e.g., 'email.domains')
 * @returns {any} Configuration value
 * @throws {Error} If configuration value is not found
 */
export function getConfig(path) {
  // In browser environment - check runtime config first
  if (typeof window !== 'undefined') {
    // Try to get from runtime config (injected by env-config.sh)
    if (window.__RUNTIME_CONFIG__) {
      const runtimeValue = getValueByPath(window.__RUNTIME_CONFIG__, path);
      if (runtimeValue !== undefined) {
        return runtimeValue;
      }
    }
    
    // Try to get from process.env (for Create React App REACT_APP_* vars)
    const envKey = `REACT_APP_${path.toUpperCase().replace(/\./g, '_')}`;
    if (process.env[envKey] !== undefined) {
      return process.env[envKey];
    }
  }

  // No config found - throw error (no fallbacks)
  throw new Error(`Configuration not found: ${path}. Ensure runtime config is loaded or REACT_APP_${path.toUpperCase().replace(/\./g, '_')} env var is set.`);
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
