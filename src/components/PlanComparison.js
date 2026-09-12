import React from 'react';
import PropTypes from 'prop-types';
import './PlanComparison.css';

const formatDuration = (seconds) => {
  if (!seconds) {
    return '—';
  }
  if (seconds % 86400 === 0) {
    const days = seconds / 86400;
    return days === 1 ? '24 hours' : `${days} days`;
  }
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600;
    return hours === 1 ? '1 hour' : `${hours} hours`;
  }
  return `${Math.round(seconds / 60)} minutes`;
};

const mailboxLifetime = (tier, extensionSeconds) => {
  if (tier.mailboxTtlOptions.length > 0) {
    return `${tier.mailboxTtlOptions.map(formatDuration).join(', ')} — you choose`;
  }
  const base = formatDuration(tier.mailboxTtlSeconds);
  return extensionSeconds
    ? `${base}, extendable by ${formatDuration(extensionSeconds)} at a time`
    : base;
};

/**
 * Plain-language comparison of what each tier actually gives you.
 *
 * Every figure comes from the entitlement sets the backend enforces, so the table cannot
 * promise a limit the service does not apply.
 */
const PlanComparison = ({ tiers, price }) => {
  const { free, pro, api, freeExtensionSeconds, premiumDomainCount, apiKeyTtlSeconds } = tiers;

  const rows = [
    {
      label: 'Price',
      free: 'Free, forever',
      pro: price.pro,
      api: price.api,
    },
    {
      label: 'Advertising',
      free: 'Ads on every page — they pay for the free inbox',
      pro: 'No ads at all',
      api: 'No ads at all',
    },
    {
      label: 'How long an address lives',
      free: mailboxLifetime(free, freeExtensionSeconds),
      pro: mailboxLifetime(pro),
      api: mailboxLifetime(api),
    },
    {
      label: 'Choosing the address',
      free: 'A random address is generated for you',
      pro: 'Pick the name yourself, for example invoices@',
      api: 'Pick the name yourself, or let the API generate one',
    },
    {
      label: 'Forward & Forget',
      free: `${free.forwardingLimit} forwards per hour`,
      pro: `${pro.forwardingLimit} forwards per hour`,
      api: `${api.forwardingLimit} forwards per hour`,
    },
    {
      label: 'QA API access',
      free: 'Not available',
      pro: 'Not included — buy the API plan for this',
      api: `Yes. Keys last ${formatDuration(apiKeyTtlSeconds)} and renew with the plan`,
    },
    {
      label: 'What you need to sign up',
      free: 'Nothing',
      pro: 'Nothing — you get a license key, not an account',
      api: 'Nothing — you get a license key and an API key',
    },
  ];

  if (premiumDomainCount > 0) {
    rows.splice(4, 0, {
      label: 'Domains',
      free: 'Shared public domains',
      pro: `${premiumDomainCount} extra domain${premiumDomainCount === 1 ? '' : 's'} kept off blocklists`,
      api: `${premiumDomainCount} extra domain${premiumDomainCount === 1 ? '' : 's'} kept off blocklists`,
    });
  }

  return (
    <div className="plan-comparison">
      <h2>What you actually get</h2>
      <table data-testid="plan-comparison">
        <thead>
          <tr>
            <th scope="col">&nbsp;</th>
            <th scope="col">Free</th>
            <th scope="col">Pro</th>
            <th scope="col">API</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td data-tier="Free">{row.free}</td>
              <td data-tier="Pro">{row.pro}</td>
              <td data-tier="API">{row.api}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="plan-comparison-note">
        Paying does not change what Hide Mail is. Addresses stay temporary and are deleted when
        they expire, we still never ask for your name or your real email address, and we still
        cannot guarantee that a particular website will accept a Hide Mail address.
      </p>
    </div>
  );
};

PlanComparison.propTypes = {
  tiers: PropTypes.shape({
    free: PropTypes.object.isRequired,
    pro: PropTypes.object.isRequired,
    api: PropTypes.object.isRequired,
    freeExtensionSeconds: PropTypes.number,
    premiumDomainCount: PropTypes.number,
    apiKeyTtlSeconds: PropTypes.number,
  }).isRequired,
  price: PropTypes.shape({
    pro: PropTypes.string.isRequired,
    api: PropTypes.string.isRequired,
  }).isRequired,
};

export default PlanComparison;
