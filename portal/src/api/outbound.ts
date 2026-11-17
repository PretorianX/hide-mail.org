import { apiFetch } from '@/api/client';
import type {
  AccountSummary,
  ActivityMessage,
  Domain,
  DomainRecord,
  ScrapeConfig,
  SendKeyMeta,
  Suppression,
} from '@/api/types';

export async function getAccountSummary(): Promise<AccountSummary> {
  return apiFetch<AccountSummary>('/api/outbound/account/summary');
}

export async function listDomains(): Promise<Domain[]> {
  const res = await apiFetch<{ success: boolean; domains: Domain[] }>('/api/outbound/domains');
  return res.domains;
}

export async function addDomain(domain: string): Promise<{
  domain: string;
  selector: string;
  state: string;
  records: DomainRecord[];
}> {
  return apiFetch('/api/outbound/domains', {
    method: 'POST',
    body: JSON.stringify({ domain }),
  });
}

export async function checkDomain(domain: string): Promise<{
  domain: string;
  state: string;
  records: DomainRecord[];
  dailyLimit?: number | null;
}> {
  return apiFetch(`/api/outbound/domains/${encodeURIComponent(domain)}/check`, {
    method: 'POST',
  });
}

export async function removeDomain(domain: string): Promise<void> {
  await apiFetch(`/api/outbound/domains/${encodeURIComponent(domain)}`, { method: 'DELETE' });
}

export async function listActivity(limit = 50): Promise<ActivityMessage[]> {
  const res = await apiFetch<{ success: boolean; messages: ActivityMessage[] }>(
    `/api/outbound/activity?limit=${limit}`,
  );
  return res.messages;
}

export async function listSuppressions(): Promise<Suppression[]> {
  const res = await apiFetch<{ success: boolean; suppressions: Suppression[] }>(
    '/api/outbound/suppressions',
  );
  return res.suppressions;
}

export async function addSuppression(email: string, reason = 'manual'): Promise<void> {
  await apiFetch('/api/outbound/suppressions', {
    method: 'POST',
    body: JSON.stringify({ email, reason }),
  });
}

export async function removeSuppression(email: string): Promise<void> {
  await apiFetch(`/api/outbound/suppressions/${encodeURIComponent(email)}`, {
    method: 'DELETE',
  });
}

export async function exportSuppressionsCsv(): Promise<string> {
  return apiFetch<string>('/api/outbound/suppressions/export');
}

export async function listSendKeys(): Promise<SendKeyMeta[]> {
  const res = await apiFetch<{ success: boolean; sendKeys: SendKeyMeta[] }>(
    '/api/outbound/send-keys',
  );
  return res.sendKeys;
}

export async function createSendKey(name: string): Promise<{
  key: string;
  name: string;
  createdAt: number;
}> {
  return apiFetch('/api/outbound/send-keys', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function revokeSendKey(name: string): Promise<void> {
  await apiFetch(`/api/outbound/send-keys/${encodeURIComponent(name)}`, { method: 'DELETE' });
}

export async function getMetricsTokenMeta(): Promise<{
  createdAt: number;
  maskedKey: string;
  scrapeConfig: ScrapeConfig;
} | null> {
  try {
    return await apiFetch('/api/outbound/metrics-token');
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error && (error as { status: number }).status === 404) {
      return null;
    }
    throw error;
  }
}

export async function rotateMetricsToken(): Promise<{
  key: string;
  createdAt: number;
  scrapeConfig: ScrapeConfig;
}> {
  return apiFetch('/api/outbound/metrics-token', { method: 'POST' });
}
