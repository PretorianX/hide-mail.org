import React from 'react';
import { render, screen } from '@testing-library/react';
import PlanComparison from './PlanComparison';

const tiers = {
  free: {
    ads: true,
    customAlias: false,
    premiumDomains: false,
    apiAccess: false,
    forwardingLimit: 2,
    mailboxTtlSeconds: 1800,
    mailboxTtlOptions: [],
    planType: 'free',
  },
  pro: {
    ads: false,
    customAlias: true,
    premiumDomains: true,
    apiAccess: false,
    forwardingLimit: 100,
    mailboxTtlSeconds: 86400,
    mailboxTtlOptions: [86400, 604800, 2592000],
    planType: 'pro',
  },
  api: {
    ads: false,
    customAlias: true,
    premiumDomains: true,
    apiAccess: true,
    forwardingLimit: 100,
    mailboxTtlSeconds: 86400,
    mailboxTtlOptions: [86400, 604800, 2592000],
    planType: 'api',
  },
  freeExtensionSeconds: 900,
  premiumDomainCount: 2,
  apiKeyTtlSeconds: 2592000,
};

const price = { pro: '149 UAH per month', api: '799 UAH per month' };

const renderTable = (overrides = {}) =>
  render(<PlanComparison tiers={{ ...tiers, ...overrides }} price={price} />);

describe('PlanComparison', () => {
  test('states the free mailbox lifetime and how it can be extended', () => {
    renderTable();

    expect(
      screen.getByText('30 minutes, extendable by 15 minutes at a time')
    ).toBeInTheDocument();
  });

  test('lists every paid mailbox lifetime option', () => {
    renderTable();

    expect(
      screen.getAllByText('24 hours, 7 days, 30 days — you choose')
    ).toHaveLength(2);
  });

  test('spells out both forwarding limits as numbers', () => {
    renderTable();

    expect(screen.getByText('2 forwards per hour')).toBeInTheDocument();
    expect(screen.getAllByText('100 forwards per hour')).toHaveLength(2);
  });

  test('shows the price of each paid tier', () => {
    renderTable();

    expect(screen.getByText('149 UAH per month')).toBeInTheDocument();
    expect(screen.getByText('799 UAH per month')).toBeInTheDocument();
  });

  test('says the API key lifetime for the API tier only', () => {
    renderTable();

    expect(
      screen.getByText('Yes. Keys last 30 days and renew with the plan')
    ).toBeInTheDocument();
    expect(screen.getByText(/buy the API plan/i)).toBeInTheDocument();
  });

  test('promises premium domains only when some are configured', () => {
    renderTable();
    expect(screen.getByText('Domains')).toBeInTheDocument();
    expect(screen.getAllByText('2 extra domains kept off blocklists')).toHaveLength(2);
  });

  test('omits the domains row when no premium domains exist', () => {
    renderTable({ premiumDomainCount: 0 });

    expect(screen.queryByText('Domains')).not.toBeInTheDocument();
    expect(screen.queryByText(/kept off blocklists/)).not.toBeInTheDocument();
  });

  test('makes clear that paying does not make addresses permanent', () => {
    renderTable();

    expect(screen.getByText(/Addresses stay temporary/)).toBeInTheDocument();
  });
});
