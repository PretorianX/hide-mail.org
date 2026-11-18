const licenseService = require('./licenseService');
const config = require('../config/config');

const mailboxTtlOptions = () => Object.values(config.pro.mailboxTtlOptions);

const planTypeOf = (license) => license.planType || license.type;

const toolFlags = (active) => ({
  senderApi: active === 'sender',
  reportsApi: active === 'reports',
  bounceApi: active === 'bounce',
  complaintApi: active === 'complaint',
  tlsApi: active === 'tls',
});

const inboxFree = (active) => ({
  ads: true,
  customAlias: false,
  premiumDomains: false,
  apiAccess: false,
  gradeApi: false,
  outboundApi: false,
  ...toolFlags(active),
  forwardingLimit: config.forwarding.freeLimit,
  mailboxTtlSeconds: config.emailExpirationSeconds,
  mailboxTtlOptions: [],
});

const freeEntitlements = () => ({
  ...inboxFree(null),
  planType: 'free',
});

const paidEntitlements = (planType) => ({
  ads: false,
  customAlias: true,
  premiumDomains: true,
  apiAccess: planType === 'api' || planType === 'suite',
  gradeApi: planType === 'suite',
  outboundApi: false,
  senderApi: planType === 'suite',
  reportsApi: planType === 'suite',
  bounceApi: planType === 'suite',
  complaintApi: planType === 'suite',
  tlsApi: planType === 'suite',
  forwardingLimit: config.forwarding.proLimit,
  mailboxTtlSeconds: config.pro.defaultMailboxTtlSeconds,
  mailboxTtlOptions: mailboxTtlOptions(),
  planType,
});

const proEntitlements = () => paidEntitlements('pro');
const apiEntitlements = () => paidEntitlements('api');
const suiteEntitlements = () => paidEntitlements('suite');

const outboundEntitlements = () => ({
  ...inboxFree(null),
  outboundApi: true,
  planType: 'outbound',
});

const gradeEntitlements = () => ({
  ...inboxFree(null),
  gradeApi: true,
  planType: 'grade',
});

const senderEntitlements = () => ({
  ...inboxFree('sender'),
  planType: 'sender',
});

const reportsEntitlements = () => ({
  ...inboxFree('reports'),
  planType: 'reports',
});

const bounceEntitlements = () => ({
  ...inboxFree('bounce'),
  planType: 'bounce',
});

const complaintEntitlements = () => ({
  ...inboxFree('complaint'),
  planType: 'complaint',
});

const tlsEntitlements = () => ({
  ...inboxFree('tls'),
  planType: 'tls',
});

const getEntitlements = (license) => {
  if (!licenseService.isActive(license)) {
    return freeEntitlements();
  }
  switch (planTypeOf(license)) {
    case 'pro':
      return proEntitlements();
    case 'api':
      return apiEntitlements();
    case 'suite':
      return suiteEntitlements();
    case 'outbound':
      return outboundEntitlements();
    case 'grade':
      return gradeEntitlements();
    case 'sender':
      return senderEntitlements();
    case 'reports':
      return reportsEntitlements();
    case 'bounce':
      return bounceEntitlements();
    case 'complaint':
      return complaintEntitlements();
    case 'tls':
      return tlsEntitlements();
    default:
      return freeEntitlements();
  }
};

/**
 * The entitlement sets behind each tier, for the public plan comparison. Served from the
 * same builders that authorize requests, so the table on /pro cannot drift from the limits
 * actually enforced.
 */
const describeTiers = () => ({
  free: freeEntitlements(),
  pro: proEntitlements(),
  api: apiEntitlements(),
  suite: suiteEntitlements(),
  outbound: outboundEntitlements(),
  grade: gradeEntitlements(),
  sender: senderEntitlements(),
  reports: reportsEntitlements(),
  bounce: bounceEntitlements(),
  complaint: complaintEntitlements(),
  tls: tlsEntitlements(),
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
