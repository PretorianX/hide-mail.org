import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { Alert, Badge, EmptyState, LoadingState } from '@/design-system';
import { listActivity } from '@/api/outbound';
import type { ActivityMessage } from '@/api/types';

const Title = styled.h1`
  margin: 0 0 ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.typography.fontSize['2xl']};
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: ${({ theme }) => theme.typography.fontSize.sm};

  th,
  td {
    text-align: left;
    padding: ${({ theme }) => theme.spacing.sm};
    border-bottom: 1px solid ${({ theme }) => theme.colors.border};
    vertical-align: top;
  }
`;

function statusBadge(status: string) {
  if (status === 'delivered') return <Badge variant="success">{status}</Badge>;
  if (status === 'bounced' || status === 'held') return <Badge variant="error">{status}</Badge>;
  if (status === 'deferred') return <Badge variant="accent">{status}</Badge>;
  return <Badge variant="default">{status}</Badge>;
}

function formatTime(value: number | null): string {
  if (!value) return '—';
  return new Date(value).toISOString().replace('T', ' ').slice(0, 19) + 'Z';
}

export function Activity() {
  const [messages, setMessages] = useState<ActivityMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listActivity(100)
      .then(setMessages)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load activity'));
  }, []);

  if (error) return <Alert variant="error">{error}</Alert>;
  if (!messages) return <LoadingState message="Loading activity…" />;

  return (
    <div>
      <Title>Activity</Title>
      {messages.length === 0 ? (
        <EmptyState title="No messages yet" description="Accepted sends appear here with delivery status." />
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Recipient</th>
              <th>Domain</th>
              <th>Last response</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {messages.map((message) => (
              <tr key={message.id}>
                <td>{statusBadge(message.status)}</td>
                <td>{message.recipient}</td>
                <td>{message.domain}</td>
                <td>{message.lastResponse || '—'}</td>
                <td>{formatTime(message.lastEventAt || message.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
