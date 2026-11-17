import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { Alert, Badge, EmptyState, LoadingState } from '@/design-system';
import { getAccountSummary } from '@/api/outbound';
import type { AccountSummary, DomainSummary } from '@/api/types';

const Title = styled.h1`
  margin: 0 0 ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.typography.fontSize['2xl']};
`;

const Grid = styled.div`
  display: grid;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Card = styled.section`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  padding: ${({ theme }) => theme.spacing.md};
`;

const Meta = styled.p`
  margin: ${({ theme }) => theme.spacing.xs} 0;
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
`;

function capLabel(dailyLimit: number | null): string {
  if (dailyLimit === null) return 'No daily cap';
  return `${dailyLimit.toLocaleString()} per day`;
}

function DomainCard({ domain, ratePerMinute }: { domain: DomainSummary; ratePerMinute: number }) {
  return (
    <Card>
      <h2>
        <Link to={`/domains/${encodeURIComponent(domain.domain)}`}>{domain.domain}</Link>{' '}
        {domain.suspended ? (
          <Badge variant="error">Suspended</Badge>
        ) : domain.state === 'verified' ? (
          <Badge variant="success">Verified</Badge>
        ) : domain.state === 'broken' ? (
          <Badge variant="error">Broken</Badge>
        ) : (
          <Badge variant="accent">Pending</Badge>
        )}
      </h2>
      <Meta>
        Today: {domain.sentToday.toLocaleString()} / {capLabel(domain.dailyLimit)}
      </Meta>
      <Meta>Rate limit: {ratePerMinute.toLocaleString()} per minute</Meta>
      <Meta>
        24h — delivered {domain.delivered24h}, deferred {domain.deferred24h}, bounced{' '}
        {domain.bounced24h}
      </Meta>
      <Meta>
        7d — delivered {domain.delivered7d}, deferred {domain.deferred7d}, bounced {domain.bounced7d}
      </Meta>
    </Card>
  );
}

export function Overview() {
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getAccountSummary()
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load summary'));
  }, []);

  if (error) return <Alert variant="error">{error}</Alert>;
  if (!summary) return <LoadingState message="Loading overview…" />;

  return (
    <div>
      <Title>Overview</Title>
      {summary.domains.length === 0 ? (
        <EmptyState title="No domains yet" description="Add a sending domain to see caps and delivery." />
      ) : (
        <Grid>
          {summary.domains.map((domain) => (
            <DomainCard key={domain.domain} domain={domain} ratePerMinute={summary.ratePerMinute} />
          ))}
        </Grid>
      )}
    </div>
  );
}
