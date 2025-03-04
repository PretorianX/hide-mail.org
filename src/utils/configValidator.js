import { getConfig } from './configLoader';

/**
 * Required configuration paths
 */
const REQUIRED_CONFIG = [
  'email.domains',
  'email.expirationTime',
  'email.extensionTime',
  'api.url',
  'api.timeout'
];

/**
 * Validates that all required configuration is present
 * @throws {Error} If any required configuration is missing
 */
export function validateConfig() {
  const missingConfig = [];
  
  for (const path of REQUIRED_CONFIG) {
    try {
      getConfig(path);
    } catch (error) {
      missingConfig.push(path);
    }
  }
  
  if (missingConfig.length > 0) {
    throw new Error(`Missing required configuration: ${missingConfig.join(', ')}`);
  }
  
  console.log('Configuration validation successful');
} 