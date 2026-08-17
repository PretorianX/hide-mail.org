const config = require('../config/config');

const ALIAS_RE = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/i;

const isPremiumDomain = (domain) => {
  if (!domain) {
    return false;
  }
  const needle = domain.toLowerCase();
  return config.premiumDomains.some((item) => item.toLowerCase() === needle);
};

const assertCanRegister = ({ email, customAlias, entitlements }) => {
  const [localPart, domain] = String(email || '').split('@');

  if (isPremiumDomain(domain) && !entitlements.premiumDomains) {
    const error = new Error('Premium domains require Hide Mail Pro');
    error.code = 'PREMIUM_DOMAIN';
    error.status = 403;
    throw error;
  }

  if (customAlias) {
    if (!entitlements.customAlias) {
      const error = new Error('Custom aliases require Hide Mail Pro');
      error.code = 'PRO_REQUIRED';
      error.status = 403;
      throw error;
    }
    if (!ALIAS_RE.test(localPart)) {
      const error = new Error('Invalid alias. Use letters, numbers, dots, hyphens or underscores.');
      error.code = 'INVALID_ALIAS';
      error.status = 400;
      throw error;
    }
  }
};

module.exports = {
  ALIAS_RE,
  isPremiumDomain,
  assertCanRegister,
};
