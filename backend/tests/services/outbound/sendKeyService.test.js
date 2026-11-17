process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.OUTBOUND_KEY_ENCRYPTION_SECRET = 'test-secret-for-outbound-domain-keys';

const sendKeyService = require('../../../services/outbound/sendKeyService');
const accountService = require('../../../services/outbound/accountService');
const redisService = require('../../../services/redisService');

const createOutboundAccount = (days = 30) => accountService.createAccount({ label: 'Acme', days });

describe('outbound sendKeyService', () => {
  beforeEach(() => {
    redisService.client.data = {};
  });

  describe('createSendKey', () => {
    it('returns a raw key matching the hm_send_ format', async () => {
      const { accountId } = await createOutboundAccount();

      const created = await sendKeyService.createSendKey({ accountId, name: 'prod' });

      expect(created.key).toMatch(/^hm_send_[0-9a-f]{48}$/);
      expect(created.name).toBe('prod');
      expect(typeof created.createdAt).toBe('number');
    });

    it('stores only the sha256 hash of the key in Redis, never the raw key', async () => {
      const { accountId } = await createOutboundAccount();

      const created = await sendKeyService.createSendKey({ accountId, name: 'prod' });

      const serialized = JSON.stringify(redisService.client.data);
      expect(serialized).not.toContain(created.key);
    });

    it('indexes the key hash under the account sendkeys set', async () => {
      const { accountId } = await createOutboundAccount();

      await sendKeyService.createSendKey({ accountId, name: 'prod' });

      const hashes = await redisService.client.smembers(`outbound:account:${accountId}:sendkeys`);
      expect(hashes).toHaveLength(1);
    });

    it('writes a Redis TTL tracking the account licence remaining seconds', async () => {
      const { accountId } = await createOutboundAccount(10);
      const expireSpy = jest.spyOn(redisService.client, 'expire');

      await sendKeyService.createSendKey({ accountId, name: 'prod' });

      const DAY_SECONDS = 24 * 60 * 60;
      const call = expireSpy.mock.calls.find(([key]) => key.startsWith('outbound:sendkey:'));
      expect(call).toBeTruthy();
      expect(call[1]).toBeLessThanOrEqual(10 * DAY_SECONDS);
      expect(call[1]).toBeGreaterThan(10 * DAY_SECONDS - 5);

      expireSpy.mockRestore();
    });
  });

  describe('listSendKeys', () => {
    it('never includes the raw key or the 64-char hash, only a 4-char mask', async () => {
      const { accountId } = await createOutboundAccount();
      const created = await sendKeyService.createSendKey({ accountId, name: 'prod' });

      const list = await sendKeyService.listSendKeys({ accountId });

      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('prod');
      expect(list[0].createdAt).toBe(created.createdAt);
      expect(list[0].maskedKey).not.toBe(created.key);
      expect(list[0].maskedKey).toHaveLength(8);
      expect(list[0].maskedKey).toMatch(/^\*{4}[0-9a-f]{4}$/);
      expect(JSON.stringify(list)).not.toContain(created.key);
    });

    it('returns an empty array for an account with no send keys', async () => {
      const { accountId } = await createOutboundAccount();

      expect(await sendKeyService.listSendKeys({ accountId })).toEqual([]);
    });

    it('only lists the calling account\'s send keys', async () => {
      const mine = await createOutboundAccount();
      const other = await createOutboundAccount();
      await sendKeyService.createSendKey({ accountId: mine.accountId, name: 'mine' });
      await sendKeyService.createSendKey({ accountId: other.accountId, name: 'other' });

      const list = await sendKeyService.listSendKeys({ accountId: mine.accountId });

      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('mine');
    });
  });

  describe('revokeSendKey', () => {
    it('removes the key from both the hash key and the account index, so a second validate call returns null', async () => {
      const { accountId } = await createOutboundAccount();
      const created = await sendKeyService.createSendKey({ accountId, name: 'prod' });
      expect(await sendKeyService.validateSendKey(created.key)).not.toBeNull();

      const revoked = await sendKeyService.revokeSendKey({ accountId, name: 'prod' });

      expect(revoked).toBe(true);
      expect(await sendKeyService.validateSendKey(created.key)).toBeNull();
      expect(await redisService.client.smembers(`outbound:account:${accountId}:sendkeys`)).toEqual([]);
    });

    it('returns false for a name that does not exist', async () => {
      const { accountId } = await createOutboundAccount();

      expect(await sendKeyService.revokeSendKey({ accountId, name: 'nope' })).toBe(false);
    });

    it('does not revoke a differently-named key belonging to the same account', async () => {
      const { accountId } = await createOutboundAccount();
      const keep = await sendKeyService.createSendKey({ accountId, name: 'keep' });
      await sendKeyService.createSendKey({ accountId, name: 'drop' });

      await sendKeyService.revokeSendKey({ accountId, name: 'drop' });

      expect(await sendKeyService.validateSendKey(keep.key)).not.toBeNull();
    });
  });

  describe('validateSendKey', () => {
    it('returns the accountId and name for a valid key', async () => {
      const { accountId } = await createOutboundAccount();
      const created = await sendKeyService.createSendKey({ accountId, name: 'prod' });

      const validated = await sendKeyService.validateSendKey(created.key);

      expect(validated).toEqual({ accountId, name: 'prod' });
    });

    it('returns null for garbage input without throwing', async () => {
      await expect(sendKeyService.validateSendKey('not-a-real-key')).resolves.toBeNull();
    });

    it('returns null for an empty/undefined key without throwing', async () => {
      await expect(sendKeyService.validateSendKey('')).resolves.toBeNull();
      await expect(sendKeyService.validateSendKey(undefined)).resolves.toBeNull();
    });
  });
});
