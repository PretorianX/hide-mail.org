/**
 * Tests for Proof of Work Service
 */

const powService = require('../../services/powService');

// Mock Redis service
jest.mock('../../services/redisService', () => {
  const store = new Map();
  return {
    client: {
      setex: jest.fn((key, ttl, value) => {
        store.set(key, value);
        return Promise.resolve('OK');
      }),
      get: jest.fn((key) => {
        return Promise.resolve(store.get(key) || null);
      }),
      del: jest.fn((key) => {
        store.delete(key);
        return Promise.resolve(1);
      }),
    },
    // Helper to clear the mock store between tests
    _clearStore: () => store.clear(),
    _getStore: () => store,
  };
});

// Mock logger
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const redisService = require('../../services/redisService');

describe('PoW Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redisService._clearStore();
  });

  describe('sha256', () => {
    it('should compute correct SHA256 hash', () => {
      const hash = powService.sha256('test');
      expect(hash).toBe('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08');
    });

    it('should produce consistent results', () => {
      const hash1 = powService.sha256('hello world');
      const hash2 = powService.sha256('hello world');
      expect(hash1).toBe(hash2);
    });
  });

  describe('meetsRequirement', () => {
    it('should return true for hash with sufficient leading zeros', () => {
      const hash = '0000abc123';
      expect(powService.meetsRequirement(hash, 4)).toBe(true);
    });

    it('should return false for hash with insufficient leading zeros', () => {
      const hash = '00abc12345';
      expect(powService.meetsRequirement(hash, 4)).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(powService.meetsRequirement('0', 1)).toBe(true);
      expect(powService.meetsRequirement('a', 1)).toBe(false);
      expect(powService.meetsRequirement('00000', 5)).toBe(true);
    });
  });

  describe('createChallenge', () => {
    it('should create a challenge with required fields', async () => {
      const challenge = await powService.createChallenge('127.0.0.1');
      
      expect(challenge).toHaveProperty('challenge');
      expect(challenge).toHaveProperty('difficulty');
      expect(challenge).toHaveProperty('expiresAt');
      expect(typeof challenge.challenge).toBe('string');
      expect(challenge.challenge.length).toBe(64); // 32 bytes in hex
      expect(challenge.difficulty).toBe(powService.POW_CONFIG.defaultDifficulty);
    });

    it('should store challenge in Redis', async () => {
      const challenge = await powService.createChallenge('127.0.0.1');
      
      expect(redisService.client.setex).toHaveBeenCalled();
      const key = `${powService.POW_CONFIG.keyPrefix}${challenge.challenge}`;
      expect(redisService._getStore().has(key)).toBe(true);
    });

    it('should use custom difficulty when provided', async () => {
      const challenge = await powService.createChallenge('127.0.0.1', 6);
      expect(challenge.difficulty).toBe(6);
    });
  });

  describe('verifySolution', () => {
    it('should reject missing challenge or nonce', async () => {
      const result1 = await powService.verifySolution(null, 'nonce');
      expect(result1.valid).toBe(false);
      expect(result1.error).toBe('Missing challenge or nonce');

      const result2 = await powService.verifySolution('challenge', null);
      expect(result2.valid).toBe(false);
      expect(result2.error).toBe('Missing challenge or nonce');
    });

    it('should reject non-existent challenge', async () => {
      const result = await powService.verifySolution('nonexistent', '12345');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Challenge not found or expired');
    });

    it('should accept valid solution', async () => {
      // Create a challenge
      const challenge = await powService.createChallenge('127.0.0.1', 1); // Low difficulty for test
      
      // Find a valid nonce
      let nonce = 0;
      let solution;
      while (nonce < 1000000) {
        solution = powService.sha256(challenge.challenge + nonce.toString());
        if (powService.meetsRequirement(solution, 1)) {
          break;
        }
        nonce++;
      }
      
      const result = await powService.verifySolution(challenge.challenge, nonce.toString());
      expect(result.valid).toBe(true);
    });

    it('should reject invalid solution', async () => {
      // Create a challenge with high difficulty
      const challenge = await powService.createChallenge('127.0.0.1', 10);
      
      // Use a nonce that definitely won't work
      const result = await powService.verifySolution(challenge.challenge, '0');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid solution');
    });

    it('should prevent replay attacks (same challenge used twice)', async () => {
      // Create a challenge with low difficulty
      const challenge = await powService.createChallenge('127.0.0.1', 1);
      
      // Find a valid nonce
      let nonce = 0;
      while (nonce < 1000000) {
        const solution = powService.sha256(challenge.challenge + nonce.toString());
        if (powService.meetsRequirement(solution, 1)) {
          break;
        }
        nonce++;
      }
      
      // First use should succeed
      const result1 = await powService.verifySolution(challenge.challenge, nonce.toString());
      expect(result1.valid).toBe(true);
      
      // Second use should fail (replay attack)
      const result2 = await powService.verifySolution(challenge.challenge, nonce.toString());
      expect(result2.valid).toBe(false);
      expect(result2.error).toBe('Challenge already used');
    });
  });

  describe('requireProofOfWork middleware', () => {
    it('should reject requests without PoW', async () => {
      const req = { body: {} };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await powService.requireProofOfWork(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        code: 'POW_REQUIRED',
      }));
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next() for valid PoW', async () => {
      // Create and solve a challenge
      const challenge = await powService.createChallenge('127.0.0.1', 1);
      
      let nonce = 0;
      while (nonce < 1000000) {
        const solution = powService.sha256(challenge.challenge + nonce.toString());
        if (powService.meetsRequirement(solution, 1)) {
          break;
        }
        nonce++;
      }

      const req = { 
        body: { 
          pow: { 
            challenge: challenge.challenge, 
            nonce: nonce.toString() 
          } 
        } 
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await powService.requireProofOfWork(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('challengeHandler', () => {
    it('should return a challenge on successful request', async () => {
      const req = {
        headers: {},
        ip: '127.0.0.1',
        connection: { remoteAddress: '127.0.0.1' },
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };

      await powService.challengeHandler(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        challenge: expect.any(String),
        difficulty: expect.any(Number),
        expiresAt: expect.any(Number),
      }));
    });

    it('should use x-forwarded-for header for IP', async () => {
      const req = {
        headers: { 'x-forwarded-for': '203.0.113.50, 70.41.3.18' },
        ip: '127.0.0.1',
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };

      await powService.challengeHandler(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
      }));
    });
  });
});
