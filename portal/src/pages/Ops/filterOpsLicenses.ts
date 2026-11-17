import type { AdminLicense } from '@/api/admin';

export type OpsLicenseFilters = {
  query: string;
  type: string;
  status: string;
};

const haystack = (license: AdminLicense): string =>
  [
    license.id,
    license.maskedKey,
    license.type,
    license.status,
    license.label,
    license.plan,
    license.accountId,
    license.ratePerMinute != null ? String(license.ratePerMinute) : null,
    license.dailyLimitDefault === null || license.dailyLimitDefault === undefined
      ? 'unlimited'
      : String(license.dailyLimitDefault),
    String(license.remainingDays),
    new Date(license.createdAt).toISOString(),
    new Date(license.expiresAt).toISOString(),
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join('\n')
    .toLowerCase();

export function filterOpsLicenses(
  licenses: AdminLicense[],
  filters: OpsLicenseFilters,
): AdminLicense[] {
  const needle = filters.query.trim().toLowerCase();
  return licenses.filter((license) => {
    if (filters.type !== 'all' && license.type !== filters.type) return false;
    if (filters.status !== 'all' && license.status !== filters.status) return false;
    if (needle && !haystack(license).includes(needle)) return false;
    return true;
  });
}

export function summarizeOpsLicenses(licenses: AdminLicense[]): {
  total: number;
  active: number;
  byType: Record<string, number>;
} {
  const byType: Record<string, number> = {};
  let active = 0;
  for (const license of licenses) {
    byType[license.type] = (byType[license.type] || 0) + 1;
    if (license.status === 'active') active += 1;
  }
  return { total: licenses.length, active, byType };
}
