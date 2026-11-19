process.env.VALID_DOMAINS = 'hide-mail.org';

const { EventEmitter } = require('events');
const { notifyMailboxWebhook } = require('../../services/qaWebhookService');
const { validatePublicHttpsWebhookUrl } = require('../../services/webhookUrlGuard');
const redisService = require('../../services/redisService');

const publicLookup = jest.fn().mockResolvedValue([
  { address: '93.184.216.34', family: 4 },
]);

describe('qaWebhookService', () => {
  beforeEach(() => {
    redisService.client.data = {};
    publicLookup.mockClear();
  });

  it('POSTs a compact payload when a webhook is stored', async () => {
    await redisService.registerMailbox('hook@hide-mail.org', 1800);
    await redisService.setMailboxWebhook('hook@hide-mail.org', 'https://example.test/inbound');
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true });

    const sent = await notifyMailboxWebhook(
      'hook@hide-mail.org',
      {
        id: 'msg-1',
        from: 'a@b.com',
        subject: 'Hi',
        receivedAt: '2026-08-17T12:00:00.000Z',
      },
      fetchImpl,
      { lookupFn: publicLookup }
    );

    expect(sent).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.test/inbound',
      expect.objectContaining({ method: 'POST', signal: expect.any(AbortSignal) })
    );
  });

  it('does nothing when no webhook is stored', async () => {
    const fetchImpl = jest.fn();
    const sent = await notifyMailboxWebhook('none@hide-mail.org', { id: '1' }, fetchImpl);
    expect(sent).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('prevents following redirects during webhook delivery', async () => {
    await redisService.registerMailbox('hook@hide-mail.org', 1800);
    await redisService.setMailboxWebhook('hook@hide-mail.org', 'https://example.test/inbound');
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true });

    await notifyMailboxWebhook(
      'hook@hide-mail.org',
      {
        id: 'msg-1',
        from: 'a@b.com',
        subject: 'Test',
        receivedAt: '2026-08-18T08:00:00.000Z',
      },
      fetchImpl,
      { lookupFn: publicLookup }
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.test/inbound',
      expect.objectContaining({ redirect: 'error' })
    );
  });

  it('blocks DNS rebinding (public at registration -> private at delivery) (#231)', async () => {
    const dnsLookup = jest
      .fn()
      .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]) // registration
      .mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]); // delivery

    await expect(
      validatePublicHttpsWebhookUrl('https://rebind.example.test/hook', dnsLookup)
    ).resolves.toEqual({ ok: true });

    await redisService.registerMailbox('hook@hide-mail.org', 1800);
    await redisService.setMailboxWebhook('hook@hide-mail.org', 'https://rebind.example.test/hook');

    const httpsRequest = jest.fn();
    const sent = await notifyMailboxWebhook(
      'hook@hide-mail.org',
      { id: 'msg-1', from: 'a@b.com', subject: 'Hi', receivedAt: '2026-08-18T08:00:00.000Z' },
      null,
      {
        lookupFn: dnsLookup,
        httpsImpl: {
          request: (url, opts, cb) => {
            httpsRequest(url, opts);
            const req = new EventEmitter();
            req.write = jest.fn();
            req.end = () => {
              opts.lookup(url.hostname, {}, (err) => {
                if (err) {
                  req.emit('error', err);
                  return;
                }
                const res = new EventEmitter();
                res.statusCode = 200;
                res.resume = jest.fn();
                cb(res);
                res.emit('end');
              });
            };
            req.destroy = jest.fn((err) => req.emit('error', err));
            return req;
          },
        },
      }
    );

    expect(sent).toBe(false);
    expect(httpsRequest).toHaveBeenCalledTimes(1);
    expect(dnsLookup).toHaveBeenCalledTimes(2);
  });

  it('times out a stalling webhook without hanging (#231)', async () => {
    await redisService.registerMailbox('hook@hide-mail.org', 1800);
    await redisService.setMailboxWebhook('hook@hide-mail.org', 'https://slow.example.test/hook');

    const sent = await notifyMailboxWebhook(
      'hook@hide-mail.org',
      { id: 'msg-1', from: 'a@b.com', subject: 'Slow', receivedAt: '2026-08-18T08:00:00.000Z' },
      null,
      {
        timeoutMs: 50,
        lookupFn: publicLookup,
        httpsImpl: {
          request: (_url, opts) => {
            const req = new EventEmitter();
            req.write = jest.fn();
            req.end = jest.fn();
            req.destroy = jest.fn((err) => req.emit('error', err));
            if (opts.signal) {
              opts.signal.addEventListener('abort', () => {
                req.destroy(opts.signal.reason || new Error('Aborted'));
              });
            }
            return req;
          },
        },
      }
    );

    expect(sent).toBe(false);
  });
});
