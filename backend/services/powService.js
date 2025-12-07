/**
 * Proof of Work (PoW) Service
 * 
 * Implements HashCash-style proof of work to prevent API abuse.
 * Attackers must spend computational resources before making requests.
 * 
 * How it works:
 * 1. Client requests a challenge from /api/challenge
 * 2. Server returns { challenge, difficulty, expiresAt }
 * 3. Client finds a nonce where SHA256(challenge + nonce) starts with 'difficulty' zeros
 * 4. Client submits { challenge, nonce, solution } with their request
 * 5. Server verifies and invalidates the challenge (single-use)
 * 
 * Difficulty levels:
 * - 4 zeros: ~65,536 hashes avg, ~50-100ms on modern browser
 * - 5 zeros: ~1,048,576 hashes avg, ~1-2s on modern browser
 * - 6 zeros: ~16,777,216 hashes avg, ~15-30s on modern browser
 */

const crypto = require('crypto');
const redisService = require('./redisService');
const logger = require('../utils/logger');

// Configuration
const POW_CONFIG = {
  // Default difficulty (number of leading zeros required in hex)
  defaultDifficulty: 4,
  // Challenge expiration time in seconds
  challengeTTL: 300, // 5 minutes
  // Prefix for Redis keys
  keyPrefix: 'pow:challenge:',
  // Used challenges prefix (to prevent replay attacks)
  usedPrefix: 'pow:used:',
  // Used challenge TTL (keep track for a while to prevent replays)
  usedTTL: 3600, // 1 hour
};

/**
 * Generate a random challenge string
 * @returns {string} Random hex string
 */
const generateChallengeString = () => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Create a new PoW challenge
 * @param {string} clientIP - Client IP address for tracking
 * @param {number} difficulty - Optional custom difficulty
 * @returns {Object} Challenge object { challenge, difficulty, expiresAt }
 */
const createChallenge = async (clientIP, difficulty = POW_CONFIG.defaultDifficulty) => {
  const challenge = generateChallengeString();
  const timestamp = Date.now();
  const expiresAt = timestamp + (POW_CONFIG.challengeTTL * 1000);
  
  const challengeData = {
    challenge,
    difficulty,
    clientIP,
    timestamp,
    expiresAt,
  };
  
  // Store challenge in Redis
  const key = `${POW_CONFIG.keyPrefix}${challenge}`;
  await redisService.client.setex(
    key,
    POW_CONFIG.challengeTTL,
    JSON.stringify(challengeData)
  );
  
  logger.debug(`PoW: Created challenge for ${clientIP}, difficulty: ${difficulty}`);
  
  return {
    challenge,
    difficulty,
    expiresAt,
  };
};

/**
 * Compute SHA256 hash
 * @param {string} data - Data to hash
 * @returns {string} Hex hash
 */
const sha256 = (data) => {
  return crypto.createHash('sha256').update(data).digest('hex');
};

/**
 * Check if hash meets difficulty requirement
 * @param {string} hash - Hash to check (hex string)
 * @param {number} difficulty - Number of leading zeros required
 * @returns {boolean}
 */
const meetsRequirement = (hash, difficulty) => {
  const prefix = '0'.repeat(difficulty);
  return hash.startsWith(prefix);
};

/**
 * Verify a PoW solution
 * @param {string} challenge - Original challenge string
 * @param {string} nonce - Client-provided nonce
 * @returns {Object} { valid: boolean, error?: string }
 */
const verifySolution = async (challenge, nonce) => {
  if (!challenge || !nonce) {
    return { valid: false, error: 'Missing challenge or nonce' };
  }
  
  // Check if challenge was already used (prevent replay attacks)
  const usedKey = `${POW_CONFIG.usedPrefix}${challenge}`;
  const wasUsed = await redisService.client.get(usedKey);
  if (wasUsed) {
    logger.warn(`PoW: Replay attack detected - challenge already used: ${challenge.substring(0, 16)}...`);
    return { valid: false, error: 'Challenge already used' };
  }
  
  // Get challenge data from Redis
  const key = `${POW_CONFIG.keyPrefix}${challenge}`;
  const challengeDataStr = await redisService.client.get(key);
  
  if (!challengeDataStr) {
    logger.warn(`PoW: Challenge not found or expired: ${challenge.substring(0, 16)}...`);
    return { valid: false, error: 'Challenge not found or expired' };
  }
  
  const challengeData = JSON.parse(challengeDataStr);
  
  // Check expiration
  if (Date.now() > challengeData.expiresAt) {
    await redisService.client.del(key);
    return { valid: false, error: 'Challenge expired' };
  }
  
  // Verify the solution: SHA256(challenge + nonce) must have required leading zeros
  const solution = sha256(challenge + nonce);
  
  if (!meetsRequirement(solution, challengeData.difficulty)) {
    logger.warn(`PoW: Invalid solution from ${challengeData.clientIP}: ${solution.substring(0, 16)}...`);
    return { valid: false, error: 'Invalid solution' };
  }
  
  // Mark challenge as used (prevent replay attacks)
  await redisService.client.setex(usedKey, POW_CONFIG.usedTTL, '1');
  
  // Delete the challenge
  await redisService.client.del(key);
  
  logger.info(`PoW: Valid solution from ${challengeData.clientIP}`);
  
  return { valid: true };
};

/**
 * Middleware to verify PoW before processing request
 * Expects: req.body.pow = { challenge, nonce }
 */
const requireProofOfWork = async (req, res, next) => {
  const pow = req.body?.pow;
  
  if (!pow) {
    return res.status(400).json({
      success: false,
      error: 'Proof of work required',
      code: 'POW_REQUIRED',
    });
  }
  
  const { challenge, nonce } = pow;
  
  const result = await verifySolution(challenge, nonce);
  
  if (!result.valid) {
    return res.status(403).json({
      success: false,
      error: result.error,
      code: 'POW_INVALID',
    });
  }
  
  next();
};

/**
 * Express route handler to create a new challenge
 */
const challengeHandler = async (req, res) => {
  try {
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                     req.ip || 
                     req.connection?.remoteAddress || 
                     'unknown';
    
    const challenge = await createChallenge(clientIP);
    
    return res.json({
      success: true,
      ...challenge,
    });
  } catch (error) {
    logger.error('PoW: Error creating challenge:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create challenge',
    });
  }
};

module.exports = {
  createChallenge,
  verifySolution,
  requireProofOfWork,
  challengeHandler,
  sha256,
  meetsRequirement,
  POW_CONFIG,
};
