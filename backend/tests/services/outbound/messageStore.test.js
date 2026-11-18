process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.OUTBOUND_KEY_ENCRYPTION_SECRET = 'test-secret-for-outbound-domain-keys';

const redisService = require('../../../services/redisService');
const messageStore = require('../../../services/outbound/messageStore');

describe('outbound messageStore', () => {
  beforeEach(() => {
    redisService.client.data = {};
  });

  describe('createMessage / getMessage', () => {
    it('round-trips a queued message with activity metadata and no body', async () => {
      await messageStore.createMessage({
        id: 'msg-1',
        accountId: 'acct-1',
        domain: 'mail.example.com',
        recipient: 'to@example.com',
        reference: 'ref-1',
        subject: 'Invoice 42',
        from: { name: 'Billing', email: 'billing@mail.example.com' },
        envelopeFrom: 'b-msg-1@hm-bounce.mail.example.com',
        clientIp: '203.0.113.10',
        sendKeyName: 'prod',
      });

      const stored = await messageStore.getMessage('msg-1');
      expect(stored).toMatchObject({
        id: 'msg-1',
        accountId: 'acct-1',
        domain: 'mail.example.com',
        recipient: 'to@example.com',
        reference: 'ref-1',
        subject: 'Invoice 42',
        from: { name: 'Billing', email: 'billing@mail.example.com' },
        envelopeFrom: 'b-msg-1@hm-bounce.mail.example.com',
        clientIp: '203.0.113.10',
        sendKeyName: 'prod',
        status: 'queued',
      });
      expect(typeof stored.createdAt).toBe('number');
      expect(stored.body).toBeUndefined();
    });

    it('defaults activity metadata to null when omitted', async () => {
      await messageStore.createMessage({
        id: 'msg-legacy',
        accountId: 'acct-1',
        domain: 'mail.example.com',
        recipient: 'to@example.com',
        reference: null,
      });

      const stored = await messageStore.getMessage('msg-legacy');
      expect(stored).toMatchObject({
        subject: null,
        from: null,
        envelopeFrom: null,
        clientIp: null,
        sendKeyName: null,
      });
    });

    it('returns null for an unknown id', async () => {
      await expect(messageStore.getMessage('missing')).resolves.toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('applying the same status twice leaves an identical record', async () => {
      jest.useFakeTimers({ now: 1_700_000_000_000 });
      try {
        await messageStore.createMessage({
          id: 'msg-2',
          accountId: 'acct-1',
          domain: 'mail.example.com',
          recipient: 'to@example.com',
          reference: null,
        });

        await messageStore.updateStatus({ id: 'msg-2', status: 'delivered', response: '250 ok' });
        const first = await messageStore.getMessage('msg-2');

        await messageStore.updateStatus({ id: 'msg-2', status: 'delivered', response: '250 ok' });
        const second = await messageStore.getMessage('msg-2');

        expect(second).toEqual(first);
        expect(second.status).toBe('delivered');
        expect(second.lastResponse).toBe('250 ok');
        expect(second.lastEventAt).toBe(1_700_000_000_000);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('listRecentMessages', () => {
    it('indexes creates and returns newest first', async () => {
      jest.useFakeTimers({ now: 1_700_000_000_000 });
      try {
        await messageStore.createMessage({
          id: 'msg-old',
          accountId: 'acct-1',
          domain: 'mail.example.com',
          recipient: 'a@example.com',
          reference: null,
        });
        jest.setSystemTime(1_700_000_000_100);
        await messageStore.createMessage({
          id: 'msg-new',
          accountId: 'acct-1',
          domain: 'mail.example.com',
          recipient: 'b@example.com',
          reference: null,
        });

        const listed = await messageStore.listRecentMessages({ accountId: 'acct-1', limit: 10 });
        expect(listed.map((m) => m.id)).toEqual(['msg-new', 'msg-old']);
      } finally {
        jest.useRealTimers();
      }
    });

    it('skips expired message ids still present in the index', async () => {
      await messageStore.createMessage({
        id: 'msg-gone',
        accountId: 'acct-1',
        domain: 'mail.example.com',
        recipient: 'a@example.com',
        reference: null,
      });
      delete redisService.client.data['outbound:message:msg-gone'];

      await expect(messageStore.listRecentMessages({ accountId: 'acct-1' })).resolves.toEqual([]);
    });
  });

  describe('idempotency', () => {
    it('returns null before anything is stored', async () => {
      await expect(
        messageStore.getReplay({ accountId: 'acct-1', idempotencyKey: 'k1' })
      ).resolves.toBeNull();
    });

    it('returns exactly what was stored', async () => {
      const body = { id: 'msg-9', status: 'queued' };
      await messageStore.storeReplay({
        accountId: 'acct-1',
        idempotencyKey: 'k1',
        statusCode: 202,
        body,
      });

      const replay = await messageStore.getReplay({ accountId: 'acct-1', idempotencyKey: 'k1' });
      expect(replay).toEqual({ statusCode: 202, body });
    });

    it('reserveReplay uses NX semantics and releaseReplay only deletes matching pending claim', async () => {
      const first = await messageStore.reserveReplay({
        accountId: 'acct-1',
        idempotencyKey: 'k2',
        requestHash: 'hash-1',
        messageId: 'msg-a',
      });
      expect(first).toEqual({ reserved: true });

      const second = await messageStore.reserveReplay({
        accountId: 'acct-1',
        idempotencyKey: 'k2',
        requestHash: 'hash-1',
        messageId: 'msg-b',
      });
      expect(second.reserved).toBe(false);
      expect(second.existing).toMatchObject({
        state: 'pending',
        requestHash: 'hash-1',
        messageId: 'msg-a',
      });

      // Wrong messageId does not release
      await messageStore.releaseReplay({ accountId: 'acct-1', idempotencyKey: 'k2', messageId: 'msg-b' });
      expect(await messageStore.getReplay({ accountId: 'acct-1', idempotencyKey: 'k2' })).not.toBeNull();

      // Matching messageId releases
      await messageStore.releaseReplay({ accountId: 'acct-1', idempotencyKey: 'k2', messageId: 'msg-a' });
      expect(await messageStore.getReplay({ accountId: 'acct-1', idempotencyKey: 'k2' })).toBeNull();
    });
  });
});
