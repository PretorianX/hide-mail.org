import { getConfig } from '../utils/configLoader.js';

// No fallback - will throw error if config is missing
const API_URL = getConfig('api.url');
const API_TIMEOUT = getConfig('api.timeout');

// ... rest of the service code ...

// Mock function to generate an email address
export const generateEmail = async (domain) => {
  // Simulate API call
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const username = generateRandomString();
  return `${username}@${domain}`;
};

// ... rest of the service code ... 