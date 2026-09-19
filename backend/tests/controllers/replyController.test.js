process.env.VALID_DOMAINS = 'hide-mail.org,mailguard.site';
process.env.EMAIL_EXPIRATION_SECONDS = '1800';
process.env.REPLY_FREE_LIMIT = '1';

jest.mock('../../services/smtpService', () => ({
  isConfigured: jest.fn(() => true),
  sendReply: jest.fn(async () => ({ messageId: '<sent@hide-mail.org>' })),
}));

const redisService = require('../../services/redisService');
const smtpService = require('../../services/smtpService');
const replyController = require('../../controllers/replyController');

const MAILBOX = 'shopper@hide-mail.org';

const mockRes = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

const call = async (handler, req) => {
  const res = mockRes();
  await handler(req, res, (err) => { throw err; });
  return res;
};

const storeIncoming = (overrides = {}) => redisService.storeEmail(MAILBOX, {
  id: 'msg-1',
  from: '"Ada Support" <ada@shop.test>',
  subject: 'Your order #4417',
  text: 'Could you confirm the delivery address?',
  messageId: '<order-4417@shop.test>',
  receivedAt: '2026-09-19T08:00:00.000Z',
  ...overrides,
});

describe('replyController.getStatus', () => {
  beforeEach(async () => {
    redisService.client.data = {};
    smtpService.isConfigured.mockReturnValue(true);
    await redisService.registerMailbox(MAILBOX, 1800);
  });

  it('returns the allowance for an active address', async () => {
    const res = await call(replyController.getStatus, { params: { email: MAILBOX } });

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: { active: true, limit: 1, remaining: 1, canReply: true },
    });
  });

  it('rejects a malformed address', async () => {
    const res = await call(replyController.getStatus, { params: { email: 'not-an-address' } });

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_ADDRESS');
  });
});

describe('replyController.sendReply', () => {
  beforeEach(async () => {
    redisService.client.data = {};
    smtpService.isConfigured.mockReturnValue(true);
    smtpService.sendReply.mockClear();
    smtpService.sendReply.mockResolvedValue({ messageId: '<sent@hide-mail.org>' });
    await redisService.registerMailbox(MAILBOX, 1800);
    await storeIncoming();
  });

  const send = (body, params = { email: MAILBOX, messageId: 'msg-1' }) =>
    call(replyController.sendReply, { params, body });

  it('sends the reply and reports the remaining allowance', async () => {
    const res = await send({ body: 'Yes, 14 Oak Street is correct.' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: { to: 'ada@shop.test', remaining: 0 },
    });
  });

  it('never lets the caller choose the recipient', async () => {
    await send({ body: 'Hello', to: 'victim@elsewhere.test' });

    expect(smtpService.sendReply).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ada@shop.test' })
    );
  });

  it('answers 400 for an empty reply', async () => {
    const res = await send({ body: '' });

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('EMPTY_BODY');
  });

  it('answers 400 for a body that is not a string', async () => {
    const res = await send({ body: 42 });

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('EMPTY_BODY');
  });

  it('answers 404 for a message the mailbox does not have', async () => {
    const res = await send({ body: 'Hello' }, { email: MAILBOX, messageId: 'nope' });

    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('MESSAGE_NOT_FOUND');
  });

  it('answers 404 for an expired address', async () => {
    const res = await send({ body: 'Hello' }, { email: 'gone@hide-mail.org', messageId: 'msg-1' });

    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('MAILBOX_NOT_ACTIVE');
  });

  it('answers 429 once the allowance is spent, naming Pro as the way past it', async () => {
    await send({ body: 'First.' });

    const res = await send({ body: 'Second.' });

    expect(res.statusCode).toBe(429);
    expect(res.body.code).toBe('REPLY_LIMIT_REACHED');
    expect(res.body.upgradeUrl).toBe('/pro');
  });

  it('answers 400 when the message has nobody to reply to', async () => {
    await storeIncoming({ id: 'msg-2', from: 'Mailer Daemon' });

    const res = await send({ body: 'Hello' }, { email: MAILBOX, messageId: 'msg-2' });

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('NO_REPLY_RECIPIENT');
  });

  it('answers 503 when outbound mail is unavailable', async () => {
    smtpService.isConfigured.mockReturnValue(false);

    const res = await send({ body: 'Hello' });

    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe('SMTP_NOT_CONFIGURED');
  });
});

describe('replyController.listReplies', () => {
  beforeEach(async () => {
    redisService.client.data = {};
    smtpService.isConfigured.mockReturnValue(true);
    smtpService.sendReply.mockResolvedValue({ messageId: '<sent@hide-mail.org>' });
    await redisService.registerMailbox(MAILBOX, 1800);
    await storeIncoming();
  });

  it('is empty before anything is sent', async () => {
    const res = await call(replyController.listReplies, {
      params: { email: MAILBOX, messageId: 'msg-1' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('lists a reply that was sent', async () => {
    await call(replyController.sendReply, {
      params: { email: MAILBOX, messageId: 'msg-1' },
      body: { body: 'Confirmed.' },
    });

    const res = await call(replyController.listReplies, {
      params: { email: MAILBOX, messageId: 'msg-1' },
    });

    expect(res.body.data).toEqual([
      expect.objectContaining({ to: 'ada@shop.test', body: 'Confirmed.' }),
    ]);
  });
});
