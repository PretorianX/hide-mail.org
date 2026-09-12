process.env.VALID_DOMAINS = 'domain1.com,domain2.com';

const codec = require('../../utils/restoreKeyCodec');

describe('restoreKeyCodec', () => {
  describe('generate', () => {
    it('produces a grouped key with the HMR prefix', () => {
      expect(codec.generate()).toMatch(/^HMR-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    });

    it('never emits the characters that get misread as digits', () => {
      const keys = Array.from({ length: 200 }, () => codec.generate()).join('');
      expect(keys).not.toMatch(/[ILOU]/);
    });

    it('does not repeat itself', () => {
      const keys = new Set(Array.from({ length: 500 }, () => codec.generate()));
      expect(keys.size).toBe(500);
    });
  });

  describe('normalize', () => {
    it('accepts the key exactly as it is displayed', () => {
      expect(codec.normalize('HMR-4F7K-2QMT-9XB3')).toBe('4F7K2QMT9XB3');
    });

    it('accepts a key typed without the prefix, dashes or capitals', () => {
      expect(codec.normalize(' 4f7k 2qmt-9xb3 ')).toBe('4F7K2QMT9XB3');
    });

    it('maps characters a person is likely to substitute', () => {
      expect(codec.normalize('HMR-4F7K-2QMT-9XBI')).toBe('4F7K2QMT9XB1');
      expect(codec.normalize('HMR-4F7K-2QMT-9XBl')).toBe('4F7K2QMT9XB1');
      expect(codec.normalize('HMR-4F7K-2QMT-9XBO')).toBe('4F7K2QMT9XB0');
    });

    it('returns null for anything that is not a key', () => {
      expect(codec.normalize('')).toBeNull();
      expect(codec.normalize(null)).toBeNull();
      expect(codec.normalize(undefined)).toBeNull();
      expect(codec.normalize(42)).toBeNull();
      expect(codec.normalize('too-short')).toBeNull();
      expect(codec.normalize('4F7K2QMT9XB3EXTRA')).toBeNull();
      expect(codec.normalize('4F7K2QMT9XBU')).toBeNull();
    });

    it('round-trips its own output', () => {
      const key = codec.generate();
      expect(codec.format(codec.normalize(key))).toBe(key);
    });
  });

  describe('format', () => {
    it('groups a normalized key for display', () => {
      expect(codec.format('4F7K2QMT9XB3')).toBe('HMR-4F7K-2QMT-9XB3');
    });
  });
});
