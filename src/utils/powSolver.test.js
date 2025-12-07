/**
 * Tests for Proof of Work Solver (Frontend)
 */

import axios from 'axios';

// Mock axios
jest.mock('axios');

// Polyfill TextEncoder for Node.js test environment
const { TextEncoder } = require('util');
global.TextEncoder = TextEncoder;

// Need to mock crypto.subtle for Node.js environment
const mockDigest = jest.fn();
Object.defineProperty(global, 'crypto', {
  value: {
    subtle: {
      digest: mockDigest,
    },
  },
});

// Import after mocking
const { requestChallenge, solveChallenge, getProofOfWork } = require('./powSolver');

describe('PoW Solver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('requestChallenge', () => {
    it('should request challenge from API', async () => {
      const mockResponse = {
        data: {
          success: true,
          challenge: 'abc123',
          difficulty: 4,
          expiresAt: Date.now() + 300000,
        },
      };
      axios.get.mockResolvedValue(mockResponse);

      const result = await requestChallenge();

      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/challenge'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
      expect(result.challenge).toBe('abc123');
      expect(result.difficulty).toBe(4);
    });

    it('should throw error on failed request', async () => {
      axios.get.mockResolvedValue({
        data: { success: false },
      });

      await expect(requestChallenge()).rejects.toThrow('Failed to get PoW challenge');
    });
  });

  describe('solveChallenge', () => {
    it('should find a valid nonce', async () => {
      // Mock crypto.subtle.digest to return predictable hashes
      let callCount = 0;
      mockDigest.mockImplementation(async () => {
        callCount++;
        // Return a hash starting with '0000' on the 5th call
        if (callCount === 5) {
          // '0000' in hex = 0x00, 0x00 for first bytes
          return new Uint8Array([0, 0, 0, 0, 170, 187, 204, 221]).buffer;
        }
        // Return non-matching hashes otherwise
        return new Uint8Array([255, 255, 255, 255, 170, 187, 204, 221]).buffer;
      });

      const result = await solveChallenge('testchallenge', 4);

      expect(result).toHaveProperty('challenge', 'testchallenge');
      expect(result).toHaveProperty('nonce');
      expect(typeof result.nonce).toBe('string');
    });

    it('should call progress callback', async () => {
      let callCount = 0;
      mockDigest.mockImplementation(async () => {
        callCount++;
        // Solve on iteration 1500 to trigger progress callback
        if (callCount >= 1500) {
          return new Uint8Array([0, 0, 0, 0, 170, 187, 204, 221]).buffer;
        }
        return new Uint8Array([255, 255, 255, 255, 170, 187, 204, 221]).buffer;
      });

      const progressCallback = jest.fn();
      await solveChallenge('testchallenge', 4, progressCallback);

      // Progress should have been called at least once (after 1000 iterations)
      expect(progressCallback).toHaveBeenCalled();
      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          iterations: expect.any(Number),
          elapsedMs: expect.any(Number),
        })
      );
    });
  });

  describe('getProofOfWork', () => {
    it('should request challenge and solve it', async () => {
      // Mock challenge request
      axios.get.mockResolvedValue({
        data: {
          success: true,
          challenge: 'testchallenge',
          difficulty: 4,
          expiresAt: Date.now() + 300000,
        },
      });

      // Mock hash to solve immediately
      mockDigest.mockResolvedValue(
        new Uint8Array([0, 0, 0, 0, 170, 187, 204, 221]).buffer
      );

      const result = await getProofOfWork();

      expect(result).toHaveProperty('challenge', 'testchallenge');
      expect(result).toHaveProperty('nonce');
    });
  });
});
