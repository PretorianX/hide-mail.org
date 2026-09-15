process.env.VALID_DOMAINS = 'domain1.com,domain2.com';

const redisService = require('../../services/redisService');
const codec = require('../../utils/restoreKeyCodec');
const restoreKeyService = require('../../services/restoreKeyService');

jest.mock('../../services/redisService', () => ({
  isMailboxActive: jest.fn(),
  getMailboxTtl: jest.fn(),
  client: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    expire: jest.fn(),
  },
}));

describe('restoreKeyService', () => {
  const mailbox = 'jane.doe@domain1.com';

  beforeEach(() => {
    jest.clearAllMocks();
    redisService.isMailboxActive.mockResolvedValue(true);
    redisService.getMailboxTtl.mockResolvedValue(1800);
    redisService.client.get.mockResolvedValue(null);
    redisService.client.set.mockResolvedValue('OK');
    redisService.client.del.mockResolvedValue(1);
    redisService.client.expire.mockResolvedValue(1);
  });

  describe('issue', () => {
    it('stores the key both ways round with the mailbox lifetime', async () => {
      const result = await restoreKeyService.issue(mailbox);

      expect(result.key).toMatch(/^HMR-/);
      expect(result.ttlSeconds).toBe(1800);
      expect(result.created).toBe(true);

      const stored = codec.normalize(result.key);
      expect(redisService.client.set).toHaveBeenCalledWith(
        `mailbox_restore:${stored}`,
        mailbox,
        'EX',
        1800
      );
      expect(redisService.client.set).toHaveBeenCalledWith(
        `mailbox_restore_key:${mailbox}`,
        stored,
        'EX',
        1800
      );
    });

    it('returns the existing key instead of a second one', async () => {
      redisService.client.get.mockResolvedValue('4F7K2QMT9XB3');

      const result = await restoreKeyService.issue(mailbox);

      expect(result.key).toBe('HMR-4F7K-2QMT-9XB3');
      expect(result.created).toBe(false);
      expect(redisService.client.set).not.toHaveBeenCalled();
    });

    it('replaces the existing key when asked to rotate', async () => {
      redisService.client.get.mockResolvedValue('4F7K2QMT9XB3');

      const result = await restoreKeyService.issue(mailbox, { rotate: true });

      expect(result.key).not.toBe('HMR-4F7K-2QMT-9XB3');
      expect(redisService.client.del).toHaveBeenCalledWith('mailbox_restore:4F7K2QMT9XB3');
    });

    it('lowercases the mailbox so the key follows the stored address', async () => {
      await restoreKeyService.issue('Jane.Doe@Domain1.com');

      expect(redisService.client.set).toHaveBeenCalledWith(
        'mailbox_restore_key:jane.doe@domain1.com',
        expect.any(String),
        'EX',
        1800
      );
    });

    it('refuses a mailbox that is not active', async () => {
      redisService.isMailboxActive.mockResolvedValue(false);

      await expect(restoreKeyService.issue(mailbox)).rejects.toThrow('MAILBOX_NOT_ACTIVE');
      expect(redisService.client.set).not.toHaveBeenCalled();
    });

    it('refuses a mailbox whose lease carries no expiry', async () => {
      redisService.getMailboxTtl.mockResolvedValue(-1);

      await expect(restoreKeyService.issue(mailbox)).rejects.toThrow('MAILBOX_NOT_ACTIVE');
    });
  });

  describe('redeem', () => {
    it('resolves a key to its mailbox and remaining lifetime', async () => {
      redisService.client.get.mockResolvedValue(mailbox);
      redisService.getMailboxTtl.mockResolvedValue(1200);

      const result = await restoreKeyService.redeem('hmr 4f7k-2qmt-9xb3');

      expect(redisService.client.get).toHaveBeenCalledWith('mailbox_restore:4F7K2QMT9XB3');
      expect(result).toEqual({ email: mailbox, ttlSeconds: 1200 });
    });

    it('returns null for a malformed key without touching Redis', async () => {
      const result = await restoreKeyService.redeem('nope');

      expect(result).toBeNull();
      expect(redisService.client.get).not.toHaveBeenCalled();
    });

    it('returns null for an unknown key', async () => {
      redisService.client.get.mockResolvedValue(null);

      expect(await restoreKeyService.redeem('HMR-4F7K-2QMT-9XB3')).toBeNull();
    });

    it('drops a key whose mailbox has gone and returns null', async () => {
      redisService.client.get.mockResolvedValue(mailbox);
      redisService.getMailboxTtl.mockResolvedValue(-2);

      expect(await restoreKeyService.redeem('HMR-4F7K-2QMT-9XB3')).toBeNull();
      expect(redisService.client.del).toHaveBeenCalledWith('mailbox_restore:4F7K2QMT9XB3');
    });
  });

  describe('revoke', () => {
    it('removes both directions', async () => {
      redisService.client.get.mockResolvedValue('4F7K2QMT9XB3');

      expect(await restoreKeyService.revoke(mailbox)).toBe(true);
      expect(redisService.client.del).toHaveBeenCalledWith('mailbox_restore:4F7K2QMT9XB3');
      expect(redisService.client.del).toHaveBeenCalledWith(`mailbox_restore_key:${mailbox}`);
    });

    it('reports nothing to revoke', async () => {
      redisService.client.get.mockResolvedValue(null);

      expect(await restoreKeyService.revoke(mailbox)).toBe(false);
      expect(redisService.client.del).not.toHaveBeenCalled();
    });
  });

  describe('syncTtl', () => {
    it('follows the mailbox when its lease is extended', async () => {
      redisService.client.get.mockResolvedValue('4F7K2QMT9XB3');

      await restoreKeyService.syncTtl(mailbox, 604800);

      expect(redisService.client.expire).toHaveBeenCalledWith(
        'mailbox_restore:4F7K2QMT9XB3',
        604800
      );
      expect(redisService.client.expire).toHaveBeenCalledWith(
        `mailbox_restore_key:${mailbox}`,
        604800
      );
    });

    it('does nothing when the mailbox has no key', async () => {
      redisService.client.get.mockResolvedValue(null);

      await restoreKeyService.syncTtl(mailbox, 604800);

      expect(redisService.client.expire).not.toHaveBeenCalled();
    });
  });

  describe('peek', () => {
    it('returns the live key for a mailbox in display form', async () => {
      redisService.client.get.mockResolvedValue('4F7K2QMT9XB3');

      expect(await restoreKeyService.peek(mailbox)).toBe('HMR-4F7K-2QMT-9XB3');
    });

    it('returns null when no key was ever issued', async () => {
      expect(await restoreKeyService.peek(mailbox)).toBeNull();
    });
  });
});
