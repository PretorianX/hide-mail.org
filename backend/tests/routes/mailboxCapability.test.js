process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.PREMIUM_DOMAINS = 'pro-hide-mail.org';
process.env.NODE_ENV = 'development';

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const redisService = require('../../services/redisService');
const logger = require('../../utils/logger');
const apiRoutes = require('../../routes/api');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', apiRoutes);
  return app;
}

describe('Mailbox capability authentication (#222)', () => {
  let app;

  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(async () => {
    jest.restoreAllMocks();
    redisService.client.data = {};
    await redisService.initializeDomains(['hide-mail.org', 'pro-hide-mail.org']);
  });

  it('issues a >=128-bit capability token and stores only its SHA-256 hash in Redis', async () => {
    const infoSpy = jest.spyOn(logger, 'info');
    const warnSpy = jest.spyOn(logger, 'warn');
    const errorSpy = jest.spyOn(logger, 'error');

    const res = await request(app)
      .post('/api/mailbox/register')
      .send({ domain: 'hide-mail.org' })
      .expect(200);

    expect(res.body.success).toBe(true);
    const { email, mailboxToken, ttlSeconds } = res.body.data;
    expect(email).toMatch(/^[0-9a-f]{24}@hide-mail\.org$/);
    expect(typeof mailboxToken).toBe('string');
    // >=128 bits => >=16 bytes => >=22 base64url chars (32 bytes => 43 chars)
    expect(Buffer.from(mailboxToken, 'base64url').length).toBeGreaterThanOrEqual(16);
    expect(ttlSeconds).toBeGreaterThan(0);

    const meta = await redisService.getMailboxMeta(email);
    expect(meta).toBeTruthy();
    const expectedHash = crypto.createHash('sha256').update(mailboxToken).digest('hex');
    expect(meta.tokenHash).toBe(expectedHash);
    expect(JSON.stringify(meta)).not.toContain(mailboxToken);

    const allLogs = [
      ...infoSpy.mock.calls,
      ...warnSpy.mock.calls,
      ...errorSpy.mock.calls,
    ].flat().join(' ');
    expect(allLogs).not.toContain(mailboxToken);
  });

  it('rejects all mailbox routes without a capability token (401)', async () => {
    const reg = await request(app)
      .post('/api/mailbox/register')
      .send({ domain: 'hide-mail.org' })
      .expect(200);
    const { email } = reg.body.data;

    await request(app).get(`/api/emails/${email}`).expect(401);
    await request(app).get(`/api/emails/${email}/msg-1`).expect(401);
    await request(app).get(`/api/emails/${email}/msg-1/attachments/0`).expect(401);
    await request(app).delete(`/api/emails/${email}/msg-1`).expect(401);
    await request(app).delete(`/api/emails/${email}`).expect(401);
    await request(app).get('/api/messages').query({ email }).expect(401);
    await request(app).post('/api/mailbox/refresh').send({ email }).expect(401);
    await request(app).post('/api/mailbox/deactivate').send({ email }).expect(401);
    await request(app)
      .post('/api/forwarding/request-otp')
      .send({ tempMailbox: email, destinationEmail: 'user@gmail.com' })
      .expect(401);
    await request(app)
      .post('/api/forwarding/verify-otp')
      .send({ tempMailbox: email, destinationEmail: 'user@gmail.com', otp: '123456' })
      .expect(401);
    await request(app).post(`/api/forwarding/forward/${email}/msg-1`).expect(401);
    await request(app).get(`/api/forwarding/status/${email}`).expect(401);
    await request(app).delete(`/api/forwarding/${email}`).expect(401);
  });

  it('two-client negative test: Client B knowing only Client A address gets 401 even with spoofed Origin', async () => {
    const regA = await request(app)
      .post('/api/mailbox/register')
      .send({ domain: 'hide-mail.org' })
      .expect(200);
    const { email: emailA, mailboxToken: tokenA } = regA.body.data;

    const regB = await request(app)
      .post('/api/mailbox/register')
      .send({ domain: 'hide-mail.org' })
      .expect(200);
    const { mailboxToken: tokenB } = regB.body.data;

    await redisService.storeEmail(emailA, {
      id: 'msg-secret',
      from: 'bank@example.com',
      subject: 'Your OTP',
      text: 'Code: 999888',
      attachments: [{
        filename: 'secret.txt',
        contentType: 'text/plain',
        encoding: 'base64',
        content: Buffer.from('top-secret').toString('base64'),
      }],
    });

    // Client B with no token and spoofed Origin
    await request(app)
      .get(`/api/emails/${emailA}`)
      .set('Origin', 'https://hide-mail.org')
      .expect(401);

    // Client B with its own tokenB against Client A's mailbox
    await request(app)
      .get(`/api/emails/${emailA}`)
      .set('Origin', 'https://hide-mail.org')
      .set('X-Mailbox-Token', tokenB)
      .expect(401);

    await request(app)
      .get('/api/messages')
      .query({ email: emailA })
      .set('X-Mailbox-Token', tokenB)
      .expect(401);

    await request(app)
      .get(`/api/emails/${emailA}/msg-secret/attachments/0`)
      .set('X-Mailbox-Token', tokenB)
      .expect(401);

    await request(app)
      .post('/api/mailbox/refresh')
      .set('X-Mailbox-Token', tokenB)
      .send({ email: emailA })
      .expect(401);

    await request(app)
      .post('/api/mailbox/deactivate')
      .set('X-Mailbox-Token', tokenB)
      .send({ email: emailA })
      .expect(401);

    await request(app)
      .post('/api/forwarding/request-otp')
      .set('X-Mailbox-Token', tokenB)
      .send({ tempMailbox: emailA, destinationEmail: 'attacker@gmail.com' })
      .expect(401);

    // Client A with valid tokenA still has full access
    const listRes = await request(app)
      .get(`/api/emails/${emailA}`)
      .set('X-Mailbox-Token', tokenA)
      .expect(200);
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].subject).toBe('Your OTP');
  });

  it('allows owner operations with valid token, refreshes meta TTL, and invalidates token on deactivate', async () => {
    const reg = await request(app)
      .post('/api/mailbox/register')
      .send({ domain: 'hide-mail.org' })
      .expect(200);
    const { email, mailboxToken } = reg.body.data;

    await redisService.storeEmail(email, {
      id: 'msg-1',
      from: 'sender@example.com',
      subject: 'Hello',
      text: 'World',
      attachments: [{
        filename: 'hello.txt',
        contentType: 'text/plain',
        encoding: 'base64',
        content: Buffer.from('hello').toString('base64'),
      }],
    });

    const listRes = await request(app)
      .get(`/api/emails/${email}`)
      .set('X-Mailbox-Token', mailboxToken)
      .expect(200);
    const storedId = listRes.body.data[0].id;

    await request(app)
      .get(`/api/emails/${email}/${storedId}`)
      .set('X-Mailbox-Token', mailboxToken)
      .expect(200);

    await request(app)
      .get(`/api/emails/${email}/${storedId}/attachments/0`)
      .set('X-Mailbox-Token', mailboxToken)
      .expect(200);

    await request(app)
      .get('/api/messages')
      .query({ email })
      .set('X-Mailbox-Token', mailboxToken)
      .expect(200);

    await request(app)
      .get(`/api/forwarding/status/${email}`)
      .set('X-Mailbox-Token', mailboxToken)
      .expect(200);

    const expireSpy = jest.spyOn(redisService.client, 'expire');
    await request(app)
      .post('/api/mailbox/refresh')
      .set('X-Mailbox-Token', mailboxToken)
      .send({ email })
      .expect(200);
    expect(expireSpy).toHaveBeenCalledWith(`mailbox_meta:${email.toLowerCase()}`, expect.any(Number));

    await request(app)
      .delete(`/api/emails/${email}`)
      .set('X-Mailbox-Token', mailboxToken)
      .expect(200);

    await request(app)
      .post('/api/mailbox/deactivate')
      .set('X-Mailbox-Token', mailboxToken)
      .send({ email })
      .expect(200);

    // Token is invalidated after deactivation
    await request(app)
      .get(`/api/emails/${email}`)
      .set('X-Mailbox-Token', mailboxToken)
      .expect(401);
  });

  it('canonicalizes mixed-case email across registration, active_mailbox, refresh, deactivate, and token verification', async () => {
    const mixedEmail = ' Mixed.Case@Hide-Mail.org ';
    const canonicalEmail = 'mixed.case@hide-mail.org';

    const reg = await request(app)
      .post('/api/mailbox/register')
      .send({ email: mixedEmail })
      .expect(200);

    expect(reg.body.data.email).toBe(canonicalEmail);
    const { mailboxToken } = reg.body.data;

    expect(redisService.client.data[`active_mailbox:${canonicalEmail}`]).toBeDefined();
    expect(redisService.client.data[`active_mailbox:${mixedEmail}`]).toBeUndefined();
    expect(redisService.client.data[`mailbox_meta:${canonicalEmail}`]).toBeDefined();

    // Lowercase re-registration must be rejected as already in use (cannot hijack mixed-case mailbox)
    const hijack = await request(app)
      .post('/api/mailbox/register')
      .send({ email: canonicalEmail })
      .expect(409);
    expect(hijack.body.code).toBe('ALIAS_TAKEN');

    // Missing vs invalid token error codes remain distinct
    const missingRes = await request(app)
      .get(`/api/emails/${encodeURIComponent('MIXED.CASE@HIDE-MAIL.ORG')}`)
      .expect(401);
    expect(missingRes.body.code).toBe('MAILBOX_TOKEN_REQUIRED');

    const invalidRes = await request(app)
      .get(`/api/emails/${encodeURIComponent('MIXED.CASE@HIDE-MAIL.ORG')}`)
      .set('X-Mailbox-Token', 'wrong-token')
      .expect(401);
    expect(invalidRes.body.code).toBe('INVALID_MAILBOX_TOKEN');

    // Mixed-case refresh and deactivate succeed with the issued token
    await request(app)
      .post('/api/mailbox/refresh')
      .set('X-Mailbox-Token', mailboxToken)
      .send({ email: ' MIXED.CASE@HIDE-MAIL.ORG ' })
      .expect(200);

    await request(app)
      .post('/api/mailbox/deactivate')
      .set('X-Mailbox-Token', mailboxToken)
      .send({ email: 'Mixed.Case@Hide-Mail.org' })
      .expect(200);

    expect(redisService.client.data[`active_mailbox:${canonicalEmail}`]).toBeUndefined();
    expect(redisService.client.data[`mailbox_meta:${canonicalEmail}`]).toBeUndefined();
  });
});
