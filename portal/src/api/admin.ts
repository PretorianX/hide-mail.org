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
  apiKey?: string;
  sendKey?: string;
  sendKeyName?: string;
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
  issueSendKey?: boolean;
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

export type AdminActivityMessage = {
  id: string;
  accountId: string;
  accountLabel: string | null;
  domain: string;
  recipient: string;
  reference: string | null;
  subject?: string | null;
  from?: { name: string | null; email: string } | null;
  envelopeFrom?: string | null;
  clientIp?: string | null;
  sendKeyName?: string | null;
  status: string;
  createdAt: number;
  lastEventAt: number | null;
  lastResponse: string | null;
};

export async function listAdminActivity(limit = 200): Promise<AdminActivityMessage[]> {
  const body = await json<{ success: boolean; messages: AdminActivityMessage[] }>(
    await fetch(`/api/admin/activity?limit=${limit}`, { credentials: 'include' })
  );
  return body.messages;
}
