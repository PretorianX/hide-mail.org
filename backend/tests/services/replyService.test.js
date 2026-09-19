process.env.VALID_DOMAINS = 'hide-mail.org,mailguard.site';
process.env.EMAIL_EXPIRATION_SECONDS = '1800';
process.env.REPLY_FREE_LIMIT = '1';
process.env.REPLY_PRO_LIMIT = '50';

jest.mock('../../services/smtpService', () => ({
  isConfigured: jest.fn(() => true),
  sendReply: jest.fn(async () => ({ messageId: '<sent@hide-mail.org>' })),
}));

jest.mock('../../services/licenseService', () => ({
  getLicense: jest.fn(async () => null),
  isActive: jest.fn((license) => Boolean(license)),
}));

const redisService = require('../../services/redisService');
const smtpService = require('../../services/smtpService');
const licenseService = require('../../services/licenseService');
const metrics = require('../../services/metricsService');
const replyStore = require('../../services/replyStore');
const replyService = require('../../services/replyService');

const MAILBOX = 'shopper@hide-mail.org';

const storeIncoming = async (overrides = {}) => {
  await redisService.storeEmail(MAILBOX, {
    id: 'msg-1',
    from: '"Ada Support" <ada@shop.test>',
    subject: 'Your order #4417',
    text: 'Could you confirm the delivery address?',
    messageId: '<order-4417@shop.test>',
    receivedAt: '2026-09-19T08:00:00.000Z',
    ...overrides,
  });
};

const goPro = () => {
  licenseService.getLicense.mockResolvedValue({ key: 'HM-TEST', planType: 'pro' });
  licenseService.isActive.mockReturnValue(true);
};

describe('replyService.getStatus', () => {
  beforeEach(async () => {
    redisService.client.data = {};
    licenseService.getLicense.mockResolvedValue(null);
    licenseService.isActive.mockImplementation((license) => Boolean(license));
    await redisService.registerMailbox(MAILBOX, 1800);
  });

  it('gives a free address one reply to spend', async () => {
    expect(await replyService.getStatus(MAILBOX)).toMatchObject({
      active: true,
      planType: 'free',
      limit: 1,
      used: 0,
      remaining: 1,
      canReply: true,
    });
  });

  it('gives a licensed address the paid allowance', async () => {
    await redisService.setMailboxMeta(MAILBOX, { licenseKey: 'HM-TEST' }, 1800);
    goPro();

    expect(await replyService.getStatus(MAILBOX)).toMatchObject({
      planType: 'pro',
      limit: 50,
      remaining: 50,
    });
  });

  it('reports the body cap so the composer can enforce the same number', async () => {
    const status = await replyService.getStatus(MAILBOX);

    expect(status.maxBodyChars).toBeGreaterThan(0);
  });

  it('says replying is impossible when no outbound SMTP is configured', async () => {
    smtpService.isConfigured.mockReturnValueOnce(false);

    expect(await replyService.getStatus(MAILBOX)).toMatchObject({
      smtpConfigured: false,
      canReply: false,
    });
  });

  it('reports an expired address as inactive rather than guessing a quota', async () => {
    expect(await replyService.getStatus('gone@hide-mail.org')).toMatchObject({
      active: false,
      canReply: false,
    });
  });
});

describe('replyService.sendReply', () => {
  beforeEach(async () => {
    redisService.client.data = {};
    licenseService.getLicense.mockResolvedValue(null);
    licenseService.isActive.mockImplementation((license) => Boolean(license));
    smtpService.sendReply.mockClear();
    smtpService.isConfigured.mockReturnValue(true);
    metrics.repliesTotal.inc.mockClear();
    await redisService.registerMailbox(MAILBOX, 1800);
    await storeIncoming();
  });

  it('sends the reply from the mailbox to the original sender', async () => {
    await replyService.sendReply(MAILBOX, 'msg-1', 'Yes, 14 Oak Street is correct.');

    expect(smtpService.sendReply).toHaveBeenCalledWith(expect.objectContaining({
      from: MAILBOX,
      to: 'ada@shop.test',
      subject: 'Re: Your order #4417',
    }));
  });

  it('reports how much of the allowance is left after sending', async () => {
    const result = await replyService.sendReply(MAILBOX, 'msg-1', 'Confirmed.');

    expect(result).toMatchObject({ to: 'ada@shop.test', remaining: 0 });
    expect(result.sentAt).toEqual(expect.any(String));
  });

  it('records the reply against the message so the user can re-read it', async () => {
    await replyService.sendReply(MAILBOX, 'msg-1', 'Confirmed.');

    expect(await replyStore.listReplies(MAILBOX, 'msg-1')).toEqual([
      expect.objectContaining({ to: 'ada@shop.test', body: 'Confirmed.' }),
    ]);
  });

  it('spends one reply from the allowance', async () => {
    await replyService.sendReply(MAILBOX, 'msg-1', 'Confirmed.');

    expect(await replyService.getStatus(MAILBOX)).toMatchObject({ used: 1, canReply: false });
  });

  it('refuses a second reply once a free address has spent its one', async () => {
    await replyService.sendReply(MAILBOX, 'msg-1', 'Confirmed.');

    await expect(replyService.sendReply(MAILBOX, 'msg-1', 'And another thing.'))
      .rejects.toMatchObject({ code: 'REPLY_LIMIT_REACHED' });
  });

  it('lets a licensed address keep going past the free limit', async () => {
    await redisService.setMailboxMeta(MAILBOX, { licenseKey: 'HM-TEST' }, 1800);
    goPro();

    await replyService.sendReply(MAILBOX, 'msg-1', 'One.');
    await replyService.sendReply(MAILBOX, 'msg-1', 'Two.');

    expect(await replyService.getStatus(MAILBOX)).toMatchObject({ used: 2, canReply: true });
  });

  it('refuses to reply from an address that has expired', async () => {
    await expect(replyService.sendReply('gone@hide-mail.org', 'msg-1', 'Hello'))
      .rejects.toMatchObject({ code: 'MAILBOX_NOT_ACTIVE' });
    expect(smtpService.sendReply).not.toHaveBeenCalled();
  });

  it('refuses to reply to a message the mailbox never received', async () => {
    await expect(replyService.sendReply(MAILBOX, 'msg-missing', 'Hello'))
      .rejects.toMatchObject({ code: 'MESSAGE_NOT_FOUND' });
    expect(smtpService.sendReply).not.toHaveBeenCalled();
  });

  it('refuses to relay to another temporary address', async () => {
    await storeIncoming({ id: 'msg-2', from: 'someone@mailguard.site' });

    await expect(replyService.sendReply(MAILBOX, 'msg-2', 'Hello'))
      .rejects.toMatchObject({ code: 'RECIPIENT_NOT_ALLOWED' });
    expect(smtpService.sendReply).not.toHaveBeenCalled();
  });

  it('refuses an empty reply without spending the allowance', async () => {
    await expect(replyService.sendReply(MAILBOX, 'msg-1', '   '))
      .rejects.toMatchObject({ code: 'EMPTY_BODY' });

    expect(await replyService.getStatus(MAILBOX)).toMatchObject({ used: 0 });
  });

  it('refuses to send when outbound SMTP is not configured', async () => {
    smtpService.isConfigured.mockReturnValue(false);

    await expect(replyService.sendReply(MAILBOX, 'msg-1', 'Hello'))
      .rejects.toMatchObject({ code: 'SMTP_NOT_CONFIGURED' });
    expect(smtpService.sendReply).not.toHaveBeenCalled();
  });

  it('does not spend the allowance when the send itself fails', async () => {
    smtpService.sendReply.mockRejectedValueOnce(Object.assign(new Error('nope'), {
      responseCode: 550,
    }));

    await expect(replyService.sendReply(MAILBOX, 'msg-1', 'Hello'))
      .rejects.toMatchObject({ code: 'RECIPIENT_REJECTED' });

    expect(await replyService.getStatus(MAILBOX)).toMatchObject({ used: 0, canReply: true });
  });

  it('counts a delivered reply and a refused one apart, so conversion can be measured', async () => {
    await replyService.sendReply(MAILBOX, 'msg-1', 'Confirmed.');
    expect(metrics.repliesTotal.inc).toHaveBeenCalledWith({ result: 'sent' });

    await expect(replyService.sendReply(MAILBOX, 'msg-1', 'Again.')).rejects.toThrow();
    expect(metrics.repliesTotal.inc).toHaveBeenCalledWith({ result: 'quota' });
  });
});
