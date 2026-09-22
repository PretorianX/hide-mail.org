import axios from 'axios';
import ReplyService from './ReplyService';

jest.mock('axios');

const MAILBOX = 'shopper@hide-mail.org';

describe('ReplyService.getStatus', () => {
  it('reads the allowance for an address', async () => {
    axios.get.mockResolvedValue({ data: { success: true, data: { remaining: 1, limit: 1 } } });

    await expect(ReplyService.getStatus(MAILBOX)).resolves.toEqual({ remaining: 1, limit: 1 });
    expect(axios.get).toHaveBeenCalledWith('/api/reply/status/shopper%40hide-mail.org');
  });
});

describe('ReplyService.listReplies', () => {
  it('reads the replies already sent for a message', async () => {
    axios.get.mockResolvedValue({ data: { success: true, data: [{ body: 'Confirmed.' }] } });

    await expect(ReplyService.listReplies(MAILBOX, 'msg-1'))
      .resolves.toEqual([{ body: 'Confirmed.' }]);
    expect(axios.get).toHaveBeenCalledWith('/api/reply/shopper%40hide-mail.org/msg-1');
  });
});

describe('ReplyService.sendReply', () => {
  it('posts only the typed text, never a recipient', async () => {
    axios.post.mockResolvedValue({ data: { success: true, data: { to: 'ada@shop.test' } } });

    await ReplyService.sendReply(MAILBOX, 'msg-1', 'Confirmed.');

    expect(axios.post).toHaveBeenCalledWith(
      '/api/reply/shopper%40hide-mail.org/msg-1',
      { body: 'Confirmed.' }
    );
  });

  it('resolves with the recipient and the remaining allowance', async () => {
    axios.post.mockResolvedValue({
      data: { success: true, data: { to: 'ada@shop.test', remaining: 0 } },
    });

    await expect(ReplyService.sendReply(MAILBOX, 'msg-1', 'Confirmed.'))
      .resolves.toEqual({ to: 'ada@shop.test', remaining: 0 });
  });

  it('surfaces the backend error code so the composer can react to it', async () => {
    axios.post.mockRejectedValue({
      response: {
        data: {
          success: false,
          error: 'This address has used all 1 of its replies.',
          code: 'REPLY_LIMIT_REACHED',
          upgradeUrl: '/pro',
        },
      },
    });

    await expect(ReplyService.sendReply(MAILBOX, 'msg-1', 'Confirmed.')).rejects.toMatchObject({
      message: 'This address has used all 1 of its replies.',
      code: 'REPLY_LIMIT_REACHED',
      upgradeUrl: '/pro',
    });
  });

  it('still reports a failure when the server sent no error payload', async () => {
    axios.post.mockRejectedValue(new Error('Network Error'));

    await expect(ReplyService.sendReply(MAILBOX, 'msg-1', 'Confirmed.'))
      .rejects.toThrow('Failed to send your reply');
  });
});
