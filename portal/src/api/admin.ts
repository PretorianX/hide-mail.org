export type AdminLicense = {
  id: string;
  maskedKey: string;
  type: string;
  status: string;
  label: string | null;
  plan: string | null;
  accountId: string | null;
  createdAt: number;
  expiresAt: number;
  remainingDays: number;
  ratePerMinute: number | null;
  dailyLimitDefault?: number | null;
  key?: string;
};

const json = async <T>(res: Response): Promise<T> => {
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error || `HTTP ${res.status}`);
  }
  return body as T;
};

export async function adminLogin(email: string, password: string): Promise<void> {
  await json(
    await fetch('/api/admin/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
  );
}

export async function adminLogout(): Promise<void> {
  await json(
    await fetch('/api/admin/logout', {
      method: 'POST',
      credentials: 'include',
    })
  );
}

export async function adminMe(): Promise<{ email: string }> {
  const body = await json<{ success: boolean; email: string }>(
    await fetch('/api/admin/me', { credentials: 'include' })
  );
  return { email: body.email };
}

export async function listAdminLicenses(): Promise<AdminLicense[]> {
  const body = await json<{ success: boolean; licenses: AdminLicense[] }>(
    await fetch('/api/admin/licenses', { credentials: 'include' })
  );
  return body.licenses;
}

export async function listLicenseTypes(): Promise<string[]> {
  const body = await json<{ success: boolean; types: string[] }>(
    await fetch('/api/admin/license-types', { credentials: 'include' })
  );
  return body.types;
}

export async function createAdminLicense(input: {
  type: string;
  days: number;
  label?: string;
  plan?: string;
  ratePerMinute?: number | '';
  dailyLimitDefault?: number | 'unlimited' | '';
}): Promise<AdminLicense> {
  const body = await json<{ success: boolean; license: AdminLicense }>(
    await fetch('/api/admin/licenses', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  );
  return body.license;
}

export async function deleteAdminLicense(id: string): Promise<void> {
  await json(
    await fetch(`/api/admin/licenses/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
    })
  );
}
