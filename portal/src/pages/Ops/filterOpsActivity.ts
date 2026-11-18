import type { AdminActivityMessage } from '@/api/admin';

export type OpsActivityFilters = {
  query: string;
  status: string;
  domain: string;
  account: string;
};

const haystack = (message: AdminActivityMessage): string =>
  [
    message.id,
    message.accountId,
    message.accountLabel,
    message.status,
    message.recipient,
    message.domain,
    message.subject,
    message.reference,
    message.lastResponse,
    message.envelopeFrom,
    message.clientIp,
    message.sendKeyName,
    message.from?.name,
    message.from?.email,
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join('\n')
    .toLowerCase();

export function filterOpsActivity(
  messages: AdminActivityMessage[],
  filters: OpsActivityFilters,
): AdminActivityMessage[] {
  const needle = filters.query.trim().toLowerCase();
  return messages.filter((message) => {
    if (filters.status !== 'all' && message.status !== filters.status) return false;
    if (filters.domain !== 'all' && message.domain !== filters.domain) return false;
    if (filters.account !== 'all') {
      const label = message.accountLabel || message.accountId || '';
      if (label !== filters.account) return false;
    }
    if (needle && !haystack(message).includes(needle)) return false;
    return true;
  });
}
