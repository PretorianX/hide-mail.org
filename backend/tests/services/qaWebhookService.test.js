process.env.VALID_DOMAINS = 'hide-mail.org';

const { notifyMailboxWebhook } = require('../../services/qaWebhookService');
const redisService = require('../../services/redisService');

describe('qaWebhookService', () => {
  beforeEach(() => {
    redisService.client.data = {};
  });

  it('POSTs a compact payload when a webhook is stored', async () => {
    await redisService.registerMailbox('hook@hide-mail.org', 1800);
    await redisService.setMailboxWebhook('hook@hide-mail.org', 'https://example.test/inbound');
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true });

    const sent = await notifyMailboxWebhook('hook@hide-mail.org', {
      id: 'msg-1',
      from: 'a@b.com',
      subject: 'Hi',
      receivedAt: '2026-08-17T12:00:00.000Z',
    }, fetchImpl);

    expect(sent).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.test/inbound',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('does nothing when no webhook is stored', async () => {
    const fetchImpl = jest.fn();
    const sent = await notifyMailboxWebhook('none@hide-mail.org', { id: '1' }, fetchImpl);
    expect(sent).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
