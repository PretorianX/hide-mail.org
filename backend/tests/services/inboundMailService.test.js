process.env.VALID_DOMAINS = 'hide-mail.org';

jest.mock('../../services/redisService', () => ({
  storeEmail: jest.fn().mockResolvedValue(true),
  isMailboxActive: jest.fn().mockResolvedValue(false),
  isMailboxKnown: jest.fn().mockResolvedValue(false),
}));

jest.mock('../../services/qaWebhookService', () => ({
  notifyMailboxWebhook: jest.fn().mockResolvedValue(undefined),
}));

const redisService = require('../../services/redisService');
const qaWebhookService = require('../../services/qaWebhookService');
const metrics = require('../../services/metricsService');
const { deliverInboundMessage } = require('../../services/inboundMailService');

const rawMessage = ({ to, subject = 'Confirm your account', body = 'Your code is 123456.' }) =>
  [
    'From: Acme <no-reply@acme.example>',
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].join('\r\n');

describe('inboundMailService.deliverInboundMessage', () => {
  beforeEach(() => {
    redisService.storeEmail.mockReset().mockResolvedValue(true);
    redisService.isMailboxActive.mockReset().mockResolvedValue(false);
    qaWebhookService.notifyMailboxWebhook.mockReset().mockResolvedValue(undefined);
  });

  const activeMailboxes = (...addresses) => {
    redisService.isMailboxActive.mockImplementation(async (address) => addresses.includes(address));
  };

  it('stores a message addressed straight to the mailbox', async () => {
    activeMailboxes('nova7@hide-mail.org');

    const result = await deliverInboundMessage({
      recipient: 'nova7@hide-mail.org',
      rawBody: rawMessage({ to: 'nova7@hide-mail.org' }),
    });

    expect(result.delivered).toBe(true);
    expect(result.mailbox).toBe('nova7@hide-mail.org');

    const [mailbox, email] = redisService.storeEmail.mock.calls[0];
    expect(mailbox).toBe('nova7@hide-mail.org');
    expect(email.subject).toBe('Confirm your account');
    expect(email.deliveredTo).toBe('nova7@hide-mail.org');
    expect(email.siteLabel).toBeNull();
  });

  it('stores a site-addressed message in the owning mailbox and records the label', async () => {
    activeMailboxes('nova7@hide-mail.org');

    const result = await deliverInboundMessage({
      recipient: 'nova7.netflix@hide-mail.org',
      rawBody: rawMessage({ to: 'nova7.netflix@hide-mail.org' }),
    });

    expect(result.delivered).toBe(true);

    const [mailbox, email] = redisService.storeEmail.mock.calls[0];
    expect(mailbox).toBe('nova7@hide-mail.org');
    expect(email.deliveredTo).toBe('nova7.netflix@hide-mail.org');
    expect(email.siteLabel).toBe('netflix');
  });

  it('normalizes the address the sender used', async () => {
    activeMailboxes('nova7@hide-mail.org');

    await deliverInboundMessage({
      recipient: 'Nova7.Netflix@Hide-Mail.org',
      rawBody: rawMessage({ to: 'Nova7.Netflix@Hide-Mail.org' }),
    });

    expect(redisService.storeEmail.mock.calls[0][1].deliveredTo).toBe('nova7.netflix@hide-mail.org');
  });

  it('notifies the QA webhook of the owning mailbox, not the site address', async () => {
    activeMailboxes('nova7@hide-mail.org');

    await deliverInboundMessage({
      recipient: 'nova7.netflix@hide-mail.org',
      rawBody: rawMessage({ to: 'nova7.netflix@hide-mail.org' }),
    });

    expect(qaWebhookService.notifyMailboxWebhook).toHaveBeenCalledWith(
      'nova7@hide-mail.org',
      expect.objectContaining({ siteLabel: 'netflix' })
    );
  });

  it('drops a message when no mailbox on the route is active', async () => {
    activeMailboxes();

    const result = await deliverInboundMessage({
      recipient: 'nova7.netflix@hide-mail.org',
      rawBody: rawMessage({ to: 'nova7.netflix@hide-mail.org' }),
    });

    expect(result.delivered).toBe(false);
    expect(result.reason).toEqual(expect.any(String));
    expect(redisService.storeEmail).not.toHaveBeenCalled();
    expect(qaWebhookService.notifyMailboxWebhook).not.toHaveBeenCalled();
  });

  it('keeps attachments serializable alongside the routing fields', async () => {
    activeMailboxes('nova7@hide-mail.org');

    const raw = [
      'From: Acme <no-reply@acme.example>',
      'To: nova7.shop@hide-mail.org',
      'Subject: Your invoice',
      'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="b1"',
      '',
      '--b1',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Invoice attached.',
      '--b1',
      'Content-Type: text/plain; charset=utf-8; name="invoice.txt"',
      'Content-Disposition: attachment; filename="invoice.txt"',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from('total: 10').toString('base64'),
      '--b1--',
    ].join('\r\n');

    await deliverInboundMessage({ recipient: 'nova7.shop@hide-mail.org', rawBody: raw });

    const email = redisService.storeEmail.mock.calls[0][1];
    expect(email.attachments).toHaveLength(1);
    expect(email.attachments[0].filename).toBe('invoice.txt');
    expect(email.attachments[0].encoding).toBe('base64');
    expect(email.siteLabel).toBe('shop');
  });

  it('counts site-addressed deliveries separately', async () => {
    activeMailboxes('nova7@hide-mail.org');

    await deliverInboundMessage({
      recipient: 'nova7.netflix@hide-mail.org',
      rawBody: rawMessage({ to: 'nova7.netflix@hide-mail.org' }),
    });

    expect(metrics.emailsSiteAddressedTotal.inc).toHaveBeenCalled();
  });
});
