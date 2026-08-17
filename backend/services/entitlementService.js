const licenseService = require('./licenseService');
const config = require('../config/config');

const mailboxTtlOptions = () => Object.values(config.pro.mailboxTtlOptions);

const planTypeOf = (license) => license.planType || license.type;

const freeEntitlements = () => ({
  ads: true,
  customAlias: false,
  premiumDomains: false,
  apiAccess: false,
  forwardingLimit: config.forwarding.freeLimit,
  mailboxTtlSeconds: config.emailExpirationSeconds,
  mailboxTtlOptions: [],
  planType: 'free',
});

const paidEntitlements = (planType) => ({
  ads: false,
  customAlias: true,
  premiumDomains: true,
  apiAccess: planType === 'api',
  forwardingLimit: config.forwarding.proLimit,
  mailboxTtlSeconds: config.pro.defaultMailboxTtlSeconds,
  mailboxTtlOptions: mailboxTtlOptions(),
  planType,
});

const getEntitlements = (license) => {
  if (!licenseService.isActive(license)) {
    return freeEntitlements();
  }
  return paidEntitlements(planTypeOf(license));
};

/**
 * The entitlement sets behind each tier, for the public plan comparison. Served from the
 * same builders that authorize requests, so the table on /pro cannot drift from the limits
 * actually enforced.
 */
const describeTiers = () => ({
  free: freeEntitlements(),
  pro: paidEntitlements('pro'),
  api: paidEntitlements('api'),
  freeExtensionSeconds: config.emailExtensionSeconds,
  premiumDomainCount: config.premiumDomains.length,
  apiKeyTtlSeconds: config.billing.apiKeyTtlSeconds,
});

const resolveMailboxTtl = (license, requestedTtl) => {
  const entitlements = getEntitlements(license);
  if (entitlements.mailboxTtlOptions.includes(requestedTtl)) {
    return requestedTtl;
  }
  return entitlements.mailboxTtlSeconds;
};

/**
 * A free mailbox is topped up by a small increment on top of the time it has left, which is
 * what the countdown's extend button offers. A paid mailbox is reset to the lifetime the
 * holder chose, since the plan already grants it.
 *
 * @param {number} remainingSeconds Seconds left, or a negative ioredis TTL code.
 */
const resolveRefreshTtl = (license, remainingSeconds, requestedTtl) => {
  const entitlements = getEntitlements(license);
  if (entitlements.mailboxTtlOptions.length > 0) {
    return resolveMailboxTtl(license, requestedTtl);
  }
  const left = remainingSeconds > 0 ? remainingSeconds : 0;
  return left + config.emailExtensionSeconds;
};

module.exports = {
  getEntitlements,
  describeTiers,
  resolveMailboxTtl,
  resolveRefreshTtl,
};
