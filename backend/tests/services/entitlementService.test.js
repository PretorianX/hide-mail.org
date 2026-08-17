process.env.VALID_DOMAINS = process.env.VALID_DOMAINS || 'hide-mail.org';
process.env.FORWARDING_FREE_LIMIT = '2';
process.env.FORWARDING_PRO_LIMIT = '100';
process.env.EMAIL_EXPIRATION_SECONDS = '1800';

const entitlementService = require('../../services/entitlementService');

describe('entitlementService', () => {
  it('returns the free tier without a license', () => {
    const entitlements = entitlementService.getEntitlements(null);

    expect(entitlements.ads).toBe(true);
    expect(entitlements.customAlias).toBe(false);
    expect(entitlements.premiumDomains).toBe(false);
    expect(entitlements.apiAccess).toBe(false);
    expect(entitlements.forwardingLimit).toBe(2);
    expect(entitlements.mailboxTtlSeconds).toBe(1800);
    expect(entitlements.mailboxTtlOptions).toEqual([]);
  });

  it('unlocks Pro mailbox options, premium domains and higher forwarding', () => {
    const entitlements = entitlementService.getEntitlements({
      type: 'pro',
      status: 'active',
      expiresAt: Date.now() + 60_000,
    });

    expect(entitlements.ads).toBe(false);
    expect(entitlements.customAlias).toBe(true);
    expect(entitlements.premiumDomains).toBe(true);
    expect(entitlements.apiAccess).toBe(false);
    expect(entitlements.forwardingLimit).toBe(100);
    expect(entitlements.mailboxTtlSeconds).toBe(86400);
    expect(entitlements.mailboxTtlOptions).toEqual([86400, 604800, 2592000]);
  });

  it('unlocks API access on the API plan', () => {
    const entitlements = entitlementService.getEntitlements({
      type: 'api',
      status: 'active',
      expiresAt: Date.now() + 60_000,
    });

    expect(entitlements.apiAccess).toBe(true);
    expect(entitlements.ads).toBe(false);
    expect(entitlements.customAlias).toBe(true);
    expect(entitlements.premiumDomains).toBe(true);
  });

  it('treats an expired license as free', () => {
    const entitlements = entitlementService.getEntitlements({
      type: 'pro',
      status: 'active',
      expiresAt: Date.now() - 1,
    });

    expect(entitlements.ads).toBe(true);
    expect(entitlements.customAlias).toBe(false);
  });

  it('resolves a requested Pro mailbox TTL only from the allowed list', () => {
    const license = {
      type: 'pro',
      status: 'active',
      expiresAt: Date.now() + 60_000,
    };

    expect(entitlementService.resolveMailboxTtl(license, 86400)).toBe(86400);
    expect(entitlementService.resolveMailboxTtl(license, 999)).toBe(86400);
    expect(entitlementService.resolveMailboxTtl(null, 86400)).toBe(1800);
  });
});
