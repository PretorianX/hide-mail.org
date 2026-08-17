process.env.VALID_DOMAINS = process.env.VALID_DOMAINS || 'hide-mail.org,private-mail.org';
process.env.PREMIUM_DOMAINS = 'inbox.pro.example';

const mailboxPolicy = require('../../services/mailboxPolicy');
const entitlementService = require('../../services/entitlementService');

describe('mailboxPolicy', () => {
  const free = entitlementService.getEntitlements(null);
  const pro = entitlementService.getEntitlements({
    type: 'pro',
    status: 'active',
    expiresAt: Date.now() + 60_000,
  });

  it('rejects a custom alias on the free tier', () => {
    expect(() => mailboxPolicy.assertCanRegister({
      email: 'anna@hide-mail.org',
      customAlias: true,
      entitlements: free,
    })).toThrow(/pro/i);
  });

  it('allows a valid custom alias for Pro', () => {
    expect(() => mailboxPolicy.assertCanRegister({
      email: 'anna@hide-mail.org',
      customAlias: true,
      entitlements: pro,
    })).not.toThrow();
  });

  it('rejects an invalid custom alias even for Pro', () => {
    expect(() => mailboxPolicy.assertCanRegister({
      email: 'bad alias!@hide-mail.org',
      customAlias: true,
      entitlements: pro,
    })).toThrow(/alias/i);
  });

  it('rejects a premium domain on the free tier', () => {
    expect(() => mailboxPolicy.assertCanRegister({
      email: 'user@inbox.pro.example',
      customAlias: false,
      entitlements: free,
    })).toThrow(/premium/i);
  });

  it('allows a premium domain for Pro', () => {
    expect(() => mailboxPolicy.assertCanRegister({
      email: 'user@inbox.pro.example',
      customAlias: false,
      entitlements: pro,
    })).not.toThrow();
  });
});
