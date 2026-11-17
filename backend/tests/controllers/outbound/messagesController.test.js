process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.OUTBOUND_KEY_ENCRYPTION_SECRET = 'test-secret-for-outbound-domain-keys';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'smtp-test' }),
  })),
}));

jest.mock('../../../services/outbound/domainVerifier');

const express = require('express');
const request = require('supertest');
const crypto = require('crypto');
const redisService = require('../../../services/redisService');
const accountService = require('../../../services/outbound/accountService');
const domainService = require('../../../services/outbound/domainService');
const sendKeyService = require('../../../services/outbound/sendKeyService');
const messageStore = require('../../../services/outbound/messageStore');
const { verifyDomain } = require('../../../services/outbound/domainVerifier');
const outboundRoutes = require('../../../routes/outbound');

const app = express();
app.use(express.json());
app.use('/api/outbound', outboundRoutes);

const createVerifiedSender = async () => {
  const account = await accountService.createAccount({ label: 'Acme', days: 30 });
  await domainService.addDomain({ accountId: account.accountId, domain: 'mail.example.com' });

  verifyDomain.mockResolvedValue({
    state: 'verified',
    records: [
      { id: 'dkim', status: 'pass' },
      { id: 'returnPath', status: 'pass' },
      { id: 'dmarc', status: 'pass' },
    ],
  });
  await domainService.checkDomain({ accountId: account.accountId, domain: 'mail.example.com' });

  const sendKey = await sendKeyService.createSendKey({ accountId: account.accountId, name: 'prod' });
  return { account, sendKey };
};

describe('Outbound Messages / Account HTTP', () => {
  beforeEach(() => {
    redisService.client.data = {};
    jest.clearAllMocks();
  });

  describe('GET /api/outbound/messages/:id', () => {
    it('returns the message for the owning send key', async () => {
      const { account, sendKey } = await createVerifiedSender();
      await messageStore.createMessage({
        id: 'msg-owned',
        accountId: account.accountId,
        domain: 'mail.example.com',
        recipient: 'to@example.org',
        reference: null,
      });

      const res = await request(app)
        .get('/api/outbound/messages/msg-owned')
        .set('Authorization', `Bearer ${sendKey.key}`)
        .expect(200);

      expect(res.body.message.id).toBe('msg-owned');
      expect(res.body.message.recipient).toBe('to@example.org');
    });

    it('returns 404 (not 403) for a message belonging to another account', async () => {
      const owner = await createVerifiedSender();
      const otherAccount = await accountService.createAccount({ label: 'Other', days: 30 });
      const otherKey = await sendKeyService.createSendKey({
        accountId: otherAccount.accountId,
        name: 'prod',
      });
      await messageStore.createMessage({
        id: 'msg-other',
        accountId: owner.account.accountId,
        domain: 'mail.example.com',
        recipient: 'to@example.org',
        reference: null,
      });

      const res = await request(app)
        .get('/api/outbound/messages/msg-other')
        .set('Authorization', `Bearer ${otherKey.key}`)
        .expect(404);

      expect(res.body.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /api/outbound/account/summary', () => {
    it('returns each domain state/dailyLimit/sent-today without message bodies', async () => {
      const { account } = await createVerifiedSender();

      const res = await request(app)
        .get('/api/outbound/account/summary')
        .set('X-License-Key', account.key)
        .expect(200);

      expect(typeof res.body.ratePerMinute).toBe('number');
      expect(res.body.ratePerMinute).toBeGreaterThan(0);
      expect(res.body.domains).toEqual([
        expect.objectContaining({
          domain: 'mail.example.com',
          state: 'verified',
          suspended: false,
          dailyLimit: 1000,
          sentToday: 0,
          delivered: 0,
          deferred: 0,
          bounced: 0,
          delivered24h: 0,
          bounced7d: 0,
        }),
      ]);
      expect(JSON.stringify(res.body)).not.toMatch(/subject|html|text/);
    });
  });

  describe('POST /api/outbound/messages', () => {
    it('queues a message with a send key and returns 202', async () => {
      const { sendKey } = await createVerifiedSender();

      const res = await request(app)
        .post('/api/outbound/messages')
        .set('Authorization', `Bearer ${sendKey.key}`)
        .set('Idempotency-Key', `idem-${crypto.randomUUID()}`)
        .send({
          from: { email: 'billing@mail.example.com', name: 'Acme' },
          to: 'client@example.org',
          subject: 'Hi',
          text: 'hello',
        })
        .expect(202);

      expect(res.body.status).toBe('queued');
      expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
    });
  });
});
