process.env.OUTBOUND_RETURN_PATH_TARGET = 'rp.hide-mail.org';

const {
  parseBounceEnvelopeFrom,
  parseOutboundBounceRecipient,
  isOutboundBounceRecipient,
} = require('../../../services/outbound/bounceEnvelope');

describe('bounceEnvelope', () => {
  it('parses messageId and domain from a well-formed hm-bounce address', () => {
    expect(parseBounceEnvelopeFrom('b-abc123@hm-bounce.mail.example.com')).toEqual({
      messageId: 'abc123',
      domain: 'mail.example.com',
    });
  });

  it('lowercases the domain from hm-bounce host', () => {
    expect(parseBounceEnvelopeFrom('b-ID@HM-BOUNCE.Mail.Example.COM')).toEqual({
      messageId: 'ID',
      domain: 'mail.example.com',
    });
  });

  it('returns null for non-VERP addresses', () => {
    expect(parseBounceEnvelopeFrom('someone@elsewhere.com')).toBeNull();
    expect(parseBounceEnvelopeFrom('')).toBeNull();
    expect(parseBounceEnvelopeFrom(null)).toBeNull();
  });

  it('accepts b-*@OUTBOUND_RETURN_PATH_TARGET with domain null', () => {
    expect(parseOutboundBounceRecipient('b-abc@rp.hide-mail.org')).toEqual({
      messageId: 'abc',
      domain: null,
    });
    expect(parseOutboundBounceRecipient('b-abc@RP.HIDE-MAIL.ORG')).toEqual({
      messageId: 'abc',
      domain: null,
    });
  });

  it('rejects b-* on unrelated hosts and non-bounce local parts on the target', () => {
    expect(parseOutboundBounceRecipient('b-abc@other.org')).toBeNull();
    expect(parseOutboundBounceRecipient('noreply@rp.hide-mail.org')).toBeNull();
  });

  it('isOutboundBounceRecipient mirrors parseOutboundBounceRecipient', () => {
    expect(isOutboundBounceRecipient('b-x@hm-bounce.a.com')).toBe(true);
    expect(isOutboundBounceRecipient('b-x@rp.hide-mail.org')).toBe(true);
    expect(isOutboundBounceRecipient('a@hide-mail.org')).toBe(false);
  });
});
