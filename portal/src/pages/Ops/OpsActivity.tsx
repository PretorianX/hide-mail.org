import { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { Alert, Badge, EmptyState, Input, LoadingState } from '@/design-system';
import { listAdminActivity, type AdminActivityMessage } from '@/api/admin';
import { OpsActivityDetailDrawer } from './OpsActivityDetailDrawer';
import { filterOpsActivity } from './filterOpsActivity';

const Title = styled.h1`
  margin: 0 0 ${({ theme }) => theme.spacing.xs};
  font-size: ${({ theme }) => theme.typography.fontSize['2xl']};
`;

const Lead = styled.p`
  margin: 0 0 ${({ theme }) => theme.spacing.lg};
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const Toolbar = styled.div`
  display: grid;
  grid-template-columns: minmax(180px, 1.4fr) repeat(3, minmax(120px, 0.8fr));
  gap: ${({ theme }) => theme.spacing.sm};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const Select = styled.select`
  height: 44px;
  padding: 0 ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text.primary};
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

function truncateSubject(subject: string | null | undefined): string {
  if (!subject) return '—';
  return subject.length > 48 ? `${subject.slice(0, 45)}…` : subject;
}

export function OpsActivity() {
  const [messages, setMessages] = useState<AdminActivityMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [domain, setDomain] = useState('all');
  const [account, setAccount] = useState('all');
  const [selected, setSelected] = useState<AdminActivityMessage | null>(null);

  useEffect(() => {
    void listAdminActivity(200)
      .then(setMessages)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load activity'));
  }, []);

  const domains = useMemo(() => {
    if (!messages) return [];
    return [...new Set(messages.map((m) => m.domain).filter(Boolean))].sort();
  }, [messages]);

  const accounts = useMemo(() => {
    if (!messages) return [];
    return [
      ...new Set(
        messages.map((m) => m.accountLabel || m.accountId).filter((value): value is string => Boolean(value)),
      ),
    ].sort();
  }, [messages]);

  const filtered = useMemo(
    () =>
      filterOpsActivity(messages || [], {
        query,
        status,
        domain,
        account,
      }),
    [messages, query, status, domain, account],
  );

  if (error) return <Alert variant="error">{error}</Alert>;
  if (!messages) return <LoadingState message="Loading activity…" />;

  return (
    <div>
      <Title>Activity</Title>
      <Lead>Outbound sends across all accounts. Same detail as the customer portal, plus account.</Lead>

      <Toolbar>
        <Input
          type="search"
          role="searchbox"
          aria-label="Search activity"
          placeholder="Search subject, recipient, IP, key, account…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="delivered">delivered</option>
          <option value="bounced">bounced</option>
          <option value="deferred">deferred</option>
          <option value="queued">queued</option>
          <option value="held">held</option>
        </Select>
        <Select aria-label="Filter by domain" value={domain} onChange={(e) => setDomain(e.target.value)}>
          <option value="all">All domains</option>
          {domains.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </Select>
        <Select aria-label="Filter by account" value={account} onChange={(e) => setAccount(e.target.value)}>
          <option value="all">All accounts</option>
          {accounts.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </Select>
      </Toolbar>

      {messages.length === 0 ? (
        <EmptyState title="No messages yet" description="Accepted outbound sends appear here." />
      ) : filtered.length === 0 ? (
        <EmptyState title="No matches" description="Try a different search or filter." />
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Account</th>
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
                aria-label={`${message.status} ${message.accountLabel || ''} ${message.subject || ''}`}
                onClick={() => setSelected(message)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelected(message);
                  }
                }}
              >
                <td>{statusBadge(message.status)}</td>
                <td>{message.accountLabel || message.accountId}</td>
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
        <OpsActivityDetailDrawer message={selected} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  );
}
