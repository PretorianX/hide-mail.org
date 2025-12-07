/**
 * Proof of Work Solver for Frontend
 * 
 * Solves HashCash-style PoW challenges to prevent API abuse.
 * Uses Web Crypto API for SHA256 hashing.
 * 
 * This runs in the browser and finds a nonce such that
 * SHA256(challenge + nonce) starts with 'difficulty' zero hex chars.
 */

import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || '/api';

/**
 * Compute SHA256 hash using Web Crypto API
 * @param {string} message - Message to hash
 * @returns {Promise<string>} Hex-encoded hash
 */
const sha256 = async (message) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Check if hash meets difficulty requirement
 * @param {string} hash - Hex-encoded hash
 * @param {number} difficulty - Number of leading zeros required
 * @returns {boolean}
 */
const meetsRequirement = (hash, difficulty) => {
  const prefix = '0'.repeat(difficulty);
  return hash.startsWith(prefix);
};

/**
 * Request a PoW challenge from the backend
 * @returns {Promise<Object>} Challenge data { challenge, difficulty, expiresAt }
 */
export const requestChallenge = async () => {
  const response = await axios.get(`${API_URL}/challenge`, {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  });
  
  if (!response.data.success) {
    throw new Error('Failed to get PoW challenge');
  }
  
  return {
    challenge: response.data.challenge,
    difficulty: response.data.difficulty,
    expiresAt: response.data.expiresAt,
  };
};

/**
 * Solve a PoW challenge
 * Finds a nonce where SHA256(challenge + nonce) has required leading zeros
 * 
 * @param {string} challenge - Challenge string from server
 * @param {number} difficulty - Number of leading zeros required in hex
 * @param {Function} onProgress - Optional callback for progress updates
 * @returns {Promise<Object>} Solution { challenge, nonce }
 */
export const solveChallenge = async (challenge, difficulty, onProgress = null) => {
  const startTime = Date.now();
  let nonce = 0;
  const batchSize = 1000; // Check progress every N hashes
  
  while (true) {
    // Process in batches to allow progress updates and avoid blocking
    for (let i = 0; i < batchSize; i++) {
      const testValue = challenge + nonce.toString();
      const hash = await sha256(testValue);
      
      if (meetsRequirement(hash, difficulty)) {
        const duration = Date.now() - startTime;
        console.log(`PoW solved in ${duration}ms with ${nonce} iterations`);
        
        return {
          challenge,
          nonce: nonce.toString(),
        };
      }
      
      nonce++;
    }
    
    // Report progress
    if (onProgress) {
      onProgress({
        iterations: nonce,
        elapsedMs: Date.now() - startTime,
      });
    }
    
    // Yield to allow UI updates (every batchSize iterations)
    await new Promise(resolve => setTimeout(resolve, 0));
  }
};

/**
 * Request and solve a PoW challenge in one call
 * @param {Function} onProgress - Optional progress callback
 * @returns {Promise<Object>} Solution ready for API call
 */
export const getProofOfWork = async (onProgress = null) => {
  // Request challenge
  const { challenge, difficulty } = await requestChallenge();
  
  // Solve it
  const solution = await solveChallenge(challenge, difficulty, onProgress);
  
  return solution;
};

export default {
  requestChallenge,
  solveChallenge,
  getProofOfWork,
};
