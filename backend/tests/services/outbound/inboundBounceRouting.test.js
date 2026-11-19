process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.OUTBOUND_RETURN_PATH_TARGET = 'rp.hide-mail.org';

jest.mock('../../../services/outbound/bounceMailbackService', () => ({
  processBounceMailback: jest.fn().mockResolvedValue({
    handled: true,
    eventType: 'bounced',
    messageId: 'm1',
  }),
}));

jest.mock('../../../services/redisService', () => ({
  storeEmail: jest.fn().mockResolvedValue(true),
  isMailboxActive: jest.fn().mockResolvedValue(false),
  isMailboxKnown: jest.fn().mockResolvedValue(false),
}));

jest.mock('../../../services/qaWebhookService', () => ({
  notifyMailboxWebhook: jest.fn().mockResolvedValue(undefined),
}));

const redisService = require('../../../services/redisService');
const bounceMailbackService = require('../../../services/outbound/bounceMailbackService');
const { buildBounceEnvelopeFrom } = require('../../../services/outbound/bounceEnvelope');
const { shouldAcceptOutboundBounceRcpt } = require('../../../services/outbound/inboundBounceRcpt');
const { deliverInboundMessage } = require('../../../services/inboundMailService');

describe('inbound bounce routing', () => {
  const signedBounce = buildBounceEnvelopeFrom(
    {
      messageId: 'm1',
      accountId: 'a1',
      domain: 'mail.example.com',
      recipient: 'gone@example.org',
    },
    'test-secret'
  );
  const signedReturnPath = `${signedBounce.split('@')[0]}@rp.hide-mail.org`;

  beforeEach(() => {
    redisService.storeEmail.mockClear();
    bounceMailbackService.processBounceMailback.mockClear();
  });

  it('shouldAcceptOutboundBounceRcpt accepts signed VERP bounce addresses only', () => {
    expect(shouldAcceptOutboundBounceRcpt(signedBounce)).toBe(true);
    expect(shouldAcceptOutboundBounceRcpt(signedReturnPath)).toBe(true);
    expect(shouldAcceptOutboundBounceRcpt('b-x@hm-bounce.a.com')).toBe(false);
    expect(shouldAcceptOutboundBounceRcpt('a@hide-mail.org')).toBe(false);
  });

  it('routes bounce recipients through mailback and never stores inbox mail', async () => {
    const rawBody = 'From: mdn@example.com\r\n\r\nignored';
    const result = await deliverInboundMessage({
      recipient: signedBounce,
      rawBody,
    });

    expect(bounceMailbackService.processBounceMailback).toHaveBeenCalledWith({
      recipient: signedBounce,
      rawBody,
    });
    expect(result).toMatchObject({
      delivered: false,
      reason: 'outbound_bounce_mailback',
    });
    expect(result.mailback).toMatchObject({ handled: true, messageId: 'm1' });
    expect(redisService.storeEmail).not.toHaveBeenCalled();
  });
});
