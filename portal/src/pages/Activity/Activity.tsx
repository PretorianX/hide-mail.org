import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { Alert, Badge, EmptyState, Input, LoadingState } from '@/design-system';
import { listActivity } from '@/api/outbound';
import type { ActivityMessage } from '@/api/types';
import { ActivityDetailDrawer } from './ActivityDetailDrawer';
import { filterActivityMessages } from './filterActivityMessages';

const Title = styled.h1`
  margin: 0 0 ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.typography.fontSize['2xl']};
`;

const Toolbar = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.md};
  max-width: 360px;
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

  tbody tr {
    cursor: pointer;
  }

  tbody tr:hover,
  tbody tr[aria-selected='true'] {
    background: rgba(0, 0, 0, 0.03);
  }
`;
const StatusCell = styled.div`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  flex-wrap: wrap;
`;

const SuppressionLink = styled(Link)`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.primaryDark};
  text-decoration: underline;
`;

function statusBadge(status: string) {
  if (status === 'delivered') return <Badge variant="success">{status}</Badge>;
  if (status === 'bounced' || status === 'held') return <Badge variant="error">{status}</Badge>;
  if (status === 'deferred' || status === 'suppressed') return <Badge variant="accent">{status}</Badge>;
  return <Badge variant="default">{status}</Badge>;
}

function formatTime(value: number | null): string {
  if (!value) return '—';
  return new Date(value).toISOString().replace('T', ' ').slice(0, 19) + 'Z';
}

function truncateSubject(subject: string | null | undefined): string {
  if (!subject) return '—';
  return subject.length > 64 ? `${subject.slice(0, 61)}…` : subject;
}

export function Activity() {
  const [messages, setMessages] = useState<ActivityMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ActivityMessage | null>(null);

  useEffect(() => {
    void listActivity(100)
      .then(setMessages)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load activity'));
  }, []);

  if (error) return <Alert variant="error">{error}</Alert>;
  if (!messages) return <LoadingState message="Loading activity…" />;

  const filtered = filterActivityMessages(messages, query);

  return (
    <div>
      <Title>Activity</Title>
      <Toolbar>
        <Input
          type="search"
          role="searchbox"
          aria-label="Search activity"
          placeholder="Search subject, recipient, IP, key…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </Toolbar>
      {messages.length === 0 ? (
        <EmptyState title="No messages yet" description="Accepted sends appear here with delivery status." />
      ) : filtered.length === 0 ? (
        <EmptyState title="No matches" description="Try a different search term." />
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Recipient</th>
              <th>Subject</th>
              <th>Domain</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((message) => (
              <tr
                key={message.id}
                tabIndex={0}
                aria-selected={selected?.id === message.id}
                aria-label={`${message.status} ${message.recipient} ${message.subject || ''}`}
                onClick={() => setSelected(message)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelected(message);
                  }
                }}
              >
                <td>
                  <StatusCell>
                    {statusBadge(message.status)}
                    {message.status === 'suppressed' ? (
                      <SuppressionLink
                        to={`/suppressions?email=${encodeURIComponent(message.recipient.toLowerCase())}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        View suppression
                      </SuppressionLink>
                    ) : null}
                  </StatusCell>
                </td>
                <td>{message.recipient}</td>
                <td>{truncateSubject(message.subject)}</td>
                <td>{message.domain}</td>
                <td>{formatTime(message.lastEventAt || message.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {selected ? (
        <ActivityDetailDrawer message={selected} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  );
}
