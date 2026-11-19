process.env.VALID_DOMAINS = 'hide-mail.org';
process.env.OUTBOUND_RETURN_PATH_TARGET = 'rp.hide-mail.org';
process.env.OUTBOUND_KEY_ENCRYPTION_SECRET = 'test-secret-for-outbound-domain-keys';

const {
  buildBounceEnvelopeFrom,
  verifyVerpMac,
  parseBounceEnvelopeFrom,
  parseOutboundBounceRecipient,
  isOutboundBounceRecipient,
} = require('../../../services/outbound/bounceEnvelope');

describe('bounceEnvelope', () => {
  afterEach(() => {
    delete process.env.OUTBOUND_VERP_ALLOW_LEGACY;
  });

  it('builds an HMAC-signed VERP address within RFC 5321 local-part length', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const addr = buildBounceEnvelopeFrom({
      messageId: uuid,
      accountId: 'acc-1',
      domain: 'Mail.Example.COM',
      recipient: 'User@Example.org',
    });

    const [local, host] = addr.split('@');
    expect(local.length).toBeLessThanOrEqual(64);
    expect(host).toBe('hm-bounce.mail.example.com');

    const parsed = parseBounceEnvelopeFrom(addr);
    expect(parsed).toMatchObject({
      messageId: uuid,
      domain: 'mail.example.com',
    });
    expect(parsed.mac).toEqual(expect.any(String));
  });

  it('verifies HMAC against messageId, accountId, domain, and recipient', () => {
    const msg = {
      id: 'm-123',
      accountId: 'acc-1',
      domain: 'mail.example.com',
      recipient: 'alice@example.org',
    };
    const addr = buildBounceEnvelopeFrom({
      messageId: msg.id,
      accountId: msg.accountId,
      domain: msg.domain,
      recipient: msg.recipient,
    });
    const parsed = parseBounceEnvelopeFrom(addr);

    expect(verifyVerpMac(parsed, msg)).toBe(true);
    expect(verifyVerpMac(parsed, { ...msg, accountId: 'acc-2' })).toBe(false);
    expect(verifyVerpMac(parsed, { ...msg, domain: 'other.example.com' })).toBe(false);
    expect(verifyVerpMac(parsed, { ...msg, recipient: 'bob@example.org' })).toBe(false);
    expect(verifyVerpMac({ ...parsed, mac: 'tamperedmac00000000000' }, msg)).toBe(false);
  });

  it('parses messageId and domain from a well-formed hm-bounce address', () => {
    expect(parseBounceEnvelopeFrom('b-abc123@hm-bounce.mail.example.com')).toEqual({
      messageId: 'abc123',
      mac: null,
      domain: 'mail.example.com',
    });
  });

  it('lowercases the domain from hm-bounce host', () => {
    expect(parseBounceEnvelopeFrom('b-ID@HM-BOUNCE.Mail.Example.COM')).toEqual({
      messageId: 'ID',
      mac: null,
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
      mac: null,
      domain: null,
    });
    expect(parseOutboundBounceRecipient('b-abc@RP.HIDE-MAIL.ORG')).toEqual({
      messageId: 'abc',
      mac: null,
      domain: null,
    });
  });

  it('rejects b-* on unrelated hosts and non-bounce local parts on the target', () => {
    expect(parseOutboundBounceRecipient('b-abc@other.org')).toBeNull();
    expect(parseOutboundBounceRecipient('noreply@rp.hide-mail.org')).toBeNull();
  });

  it('isOutboundBounceRecipient rejects unsigned VERP by default and accepts signed VERP', () => {
    const signed = buildBounceEnvelopeFrom({
      messageId: 'x',
      accountId: 'a1',
      domain: 'a.com',
      recipient: 'u@b.com',
    });
    expect(isOutboundBounceRecipient(signed)).toBe(true);
    expect(isOutboundBounceRecipient('b-x@hm-bounce.a.com')).toBe(false);
    expect(isOutboundBounceRecipient('b-x@rp.hide-mail.org')).toBe(false);
    expect(isOutboundBounceRecipient('a@hide-mail.org')).toBe(false);

    process.env.OUTBOUND_VERP_ALLOW_LEGACY = 'true';
    expect(isOutboundBounceRecipient('b-x@hm-bounce.a.com')).toBe(true);
    expect(isOutboundBounceRecipient('b-x@rp.hide-mail.org')).toBe(true);
  });
});
