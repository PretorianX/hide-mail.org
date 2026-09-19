process.env.VALID_DOMAINS = 'hide-mail.org';

const redisService = require('../../services/redisService');
const replyStore = require('../../services/replyStore');

const MAILBOX = 'shopper@hide-mail.org';

describe('replyStore quota', () => {
  beforeEach(async () => {
    redisService.client.data = {};
    await redisService.registerMailbox(MAILBOX, 1800);
  });

  it('reports the full allowance before anything is sent', async () => {
    expect(await replyStore.getQuota(MAILBOX, 1)).toEqual({
      limit: 1,
      used: 0,
      remaining: 1,
      canReply: true,
    });
  });

  it('counts a consumed reply against the allowance', async () => {
    await replyStore.consumeQuota(MAILBOX);

    expect(await replyStore.getQuota(MAILBOX, 1)).toEqual({
      limit: 1,
      used: 1,
      remaining: 0,
      canReply: false,
    });
  });

  it('keeps counting for a plan with a larger allowance', async () => {
    await replyStore.consumeQuota(MAILBOX);

    expect(await replyStore.getQuota(MAILBOX, 50)).toMatchObject({
      used: 1,
      remaining: 49,
      canReply: true,
    });
  });

  it('never reports a negative remainder when the plan shrinks', async () => {
    await replyStore.consumeQuota(MAILBOX);
    await replyStore.consumeQuota(MAILBOX);

    expect(await replyStore.getQuota(MAILBOX, 1)).toMatchObject({
      used: 2,
      remaining: 0,
      canReply: false,
    });
  });

  it('counts one spelling of an address, whatever case the caller used', async () => {
    await replyStore.consumeQuota('Shopper@Hide-Mail.ORG');

    expect(await replyStore.getQuota(MAILBOX, 1)).toMatchObject({ used: 1 });
  });

  it('binds the counter to the mailbox lease so it cannot outlive the address', async () => {
    await replyStore.consumeQuota(MAILBOX);

    expect(await redisService.client.ttl(`reply_quota:${MAILBOX}`)).toBeGreaterThan(0);
  });
});

describe('replyStore sent replies', () => {
  beforeEach(async () => {
    redisService.client.data = {};
    await redisService.registerMailbox(MAILBOX, 1800);
  });

  it('has nothing to show for a message that was never answered', async () => {
    expect(await replyStore.listReplies(MAILBOX, 'msg-1')).toEqual([]);
  });

  it('records what was sent so the user can see their own answer', async () => {
    await replyStore.recordReply(MAILBOX, 'msg-1', {
      to: 'ada@shop.test',
      subject: 'Re: Your order #4417',
      body: 'Yes, 14 Oak Street is correct.',
      sentAt: '2026-09-19T09:00:00.000Z',
    });

    expect(await replyStore.listReplies(MAILBOX, 'msg-1')).toEqual([
      {
        to: 'ada@shop.test',
        subject: 'Re: Your order #4417',
        body: 'Yes, 14 Oak Street is correct.',
        sentAt: '2026-09-19T09:00:00.000Z',
      },
    ]);
  });

  it('keeps replies in the order they were sent', async () => {
    await replyStore.recordReply(MAILBOX, 'msg-1', { body: 'first' });
    await replyStore.recordReply(MAILBOX, 'msg-1', { body: 'second' });

    expect((await replyStore.listReplies(MAILBOX, 'msg-1')).map((r) => r.body))
      .toEqual(['first', 'second']);
  });

  it('keeps each message thread separate', async () => {
    await replyStore.recordReply(MAILBOX, 'msg-1', { body: 'first' });

    expect(await replyStore.listReplies(MAILBOX, 'msg-2')).toEqual([]);
  });

  it('binds the log to the mailbox lease', async () => {
    await replyStore.recordReply(MAILBOX, 'msg-1', { body: 'first' });

    expect(await redisService.client.ttl(`reply_sent:${MAILBOX}:msg-1`)).toBeGreaterThan(0);
  });
});
