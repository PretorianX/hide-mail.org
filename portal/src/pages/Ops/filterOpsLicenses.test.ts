import { filterOpsLicenses, summarizeOpsLicenses } from './filterOpsLicenses';
import type { AdminLicense } from '@/api/admin';

const base = (overrides: Partial<AdminLicense>): AdminLicense => ({
  id: 'id-1',
  maskedKey: '****AAAA',
  type: 'outbound',
  status: 'active',
  label: 'acme',
  plan: null,
  accountId: 'acct-1',
  createdAt: 1_700_000_000_000,
  expiresAt: 1_700_086_400_000,
  remainingDays: 30,
  ratePerMinute: 600,
  dailyLimitDefault: null,
  ...overrides,
});

describe('filterOpsLicenses', () => {
  const licenses = [
    base({ id: 'a', maskedKey: '****ZQLL', label: 'ecabinet.tax', type: 'outbound' }),
    base({
      id: 'b',
      maskedKey: '****J237',
      label: 'suite-ci',
      type: 'suite',
      status: 'expired',
      accountId: null,
      ratePerMinute: null,
      dailyLimitDefault: 1000,
    }),
  ];

  it('returns all when query and filters are empty', () => {
    expect(filterOpsLicenses(licenses, { query: '', type: 'all', status: 'all' })).toEqual(licenses);
  });

  it('matches any field and type/status filters', () => {
    expect(
      filterOpsLicenses(licenses, { query: 'zql', type: 'all', status: 'all' }).map((l) => l.id),
    ).toEqual(['a']);
    expect(
      filterOpsLicenses(licenses, { query: 'suite-ci', type: 'all', status: 'all' }).map((l) => l.id),
    ).toEqual(['b']);
    expect(
      filterOpsLicenses(licenses, { query: '', type: 'suite', status: 'all' }).map((l) => l.id),
    ).toEqual(['b']);
    expect(
      filterOpsLicenses(licenses, { query: '', type: 'all', status: 'expired' }).map((l) => l.id),
    ).toEqual(['b']);
    expect(
      filterOpsLicenses(licenses, { query: 'ecabinet', type: 'outbound', status: 'active' }).map(
        (l) => l.id,
      ),
    ).toEqual(['a']);
  });
});

describe('summarizeOpsLicenses', () => {
  it('counts total, active, and per-type', () => {
    const licenses = [
      base({ id: '1', type: 'outbound', status: 'active' }),
      base({ id: '2', type: 'outbound', status: 'expired' }),
      base({ id: '3', type: 'suite', status: 'active' }),
    ];
    expect(summarizeOpsLicenses(licenses)).toEqual({
      total: 3,
      active: 2,
      byType: { outbound: 2, suite: 1 },
    });
  });
});
