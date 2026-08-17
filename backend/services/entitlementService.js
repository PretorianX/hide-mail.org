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

const resolveMailboxTtl = (license, requestedTtl) => {
  const entitlements = getEntitlements(license);
  if (entitlements.mailboxTtlOptions.includes(requestedTtl)) {
    return requestedTtl;
  }
  return entitlements.mailboxTtlSeconds;
};

module.exports = {
  getEntitlements,
  resolveMailboxTtl,
};
