process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.OUTBOUND_KEY_ENCRYPTION_SECRET = 'test-secret-for-outbound-domain-keys';
process.env.ADMIN_EMAIL = 'admin@hide-mail.org';
process.env.ADMIN_PASSWORD = 'test-admin-password';
process.env.ADMIN_SESSION_SECRET = 'test-admin-session-secret';

const redisService = require('../../services/redisService');
const accountService = require('../../services/outbound/accountService');
const messageStore = require('../../services/outbound/messageStore');
const adminActivityService = require('../../services/adminActivityService');

describe('adminActivityService.listActivity', () => {
  beforeEach(() => {
    redisService.client.data = {};
  });

  it('merges recent messages across outbound accounts newest first and attaches labels', async () => {
    const a = await accountService.createAccount({ label: 'acme', days: 30 });
    const b = await accountService.createAccount({ label: 'beta', days: 30 });

    await messageStore.createMessage({
      id: 'm-old',
      accountId: a.accountId,
      domain: 'a.example.com',
      recipient: 'old@example.org',
      subject: 'Old',
      from: { name: null, email: 'from@a.example.com' },
      envelopeFrom: 'b-m-old@hm-bounce.a.example.com',
      clientIp: '203.0.113.1',
      sendKeyName: 'prod',
    });
    await messageStore.updateStatus({ id: 'm-old', status: 'delivered', response: 'ok' });

    // Ensure newer timestamp on the second account's message.
    jest.useFakeTimers({ now: Date.now() + 60_000 });
    try {
      await messageStore.createMessage({
        id: 'm-new',
        accountId: b.accountId,
        domain: 'b.example.com',
        recipient: 'new@example.org',
        subject: 'New',
        from: { name: 'Beta', email: 'from@b.example.com' },
        envelopeFrom: 'b-m-new@hm-bounce.b.example.com',
        clientIp: '198.51.100.2',
        sendKeyName: 'ci',
      });
      await messageStore.updateStatus({
        id: 'm-new',
        status: 'bounced',
        response: '550 5.1.1',
      });
    } finally {
      jest.useRealTimers();
    }

    const messages = await adminActivityService.listActivity({ limit: 50 });
    expect(messages.map((m) => m.id)).toEqual(['m-new', 'm-old']);
    expect(messages[0]).toMatchObject({
      id: 'm-new',
      accountId: b.accountId,
      accountLabel: 'beta',
      domain: 'b.example.com',
      subject: 'New',
      status: 'bounced',
      sendKeyName: 'ci',
    });
    expect(messages[1]).toMatchObject({
      id: 'm-old',
      accountLabel: 'acme',
      status: 'delivered',
    });
    expect(JSON.stringify(messages)).not.toMatch(/^HM-/);
  });

  it('respects the limit after merge', async () => {
    const account = await accountService.createAccount({ label: 'solo', days: 30 });
    for (let i = 0; i < 5; i += 1) {
      await messageStore.createMessage({
        id: `m-${i}`,
        accountId: account.accountId,
        domain: 'solo.example.com',
        recipient: `u${i}@example.org`,
        reference: null,
      });
    }
    const messages = await adminActivityService.listActivity({ limit: 2 });
    expect(messages).toHaveLength(2);
  });

  it('returns an empty list when there are no outbound accounts', async () => {
    await expect(adminActivityService.listActivity({ limit: 20 })).resolves.toEqual([]);
  });
});
