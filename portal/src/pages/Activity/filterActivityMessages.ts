import type { ActivityMessage } from '@/api/types';

const haystack = (message: ActivityMessage): string =>
  [
    message.id,
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

export function filterActivityMessages(
  messages: ActivityMessage[],
  query: string,
): ActivityMessage[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return messages;
  return messages.filter((message) => haystack(message).includes(needle));
}
