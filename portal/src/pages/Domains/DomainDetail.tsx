import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { Alert, Badge, Button, ConfirmDialog, LoadingState } from '@/design-system';
import { checkDomain, listDomains, removeDomain } from '@/api/outbound';
import type { Domain } from '@/api/types';
import { DnsRecordsTable } from '@/pages/Domains/DnsRecordsTable';

const Title = styled.h1`
  margin: 0 0 ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.typography.fontSize['2xl']};
`;

const Meta = styled.p`
  margin: 0 0 ${({ theme }) => theme.spacing.lg};
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-top: ${({ theme }) => theme.spacing.lg};
  flex-wrap: wrap;
`;

function capLabel(dailyLimit: number | null | undefined): string {
  if (dailyLimit === null || dailyLimit === undefined) return 'No daily cap';
  return `${dailyLimit.toLocaleString()} per day`;
}

export function DomainDetail() {
  const { domain: rawDomain } = useParams();
  const domainName = decodeURIComponent(rawDomain || '');
  const navigate = useNavigate();
  const [domain, setDomain] = useState<Domain | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const load = async () => {
    const domains = await listDomains();
    const found = domains.find((item) => item.domain === domainName) || null;
    setDomain(found);
    if (!found) setError('Domain not found');
  };

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, [domainName]);

  const heading = useMemo(() => domain?.domain || domainName, [domain, domainName]);

  const onCheck = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await checkDomain(domainName);
      setDomain((prev) =>
        prev
          ? {
              ...prev,
              state: result.state as Domain['state'],
              records: result.records,
              dailyLimit:
                result.dailyLimit !== undefined ? result.dailyLimit : prev.dailyLimit,
            }
          : {
              domain: result.domain,
              state: result.state as Domain['state'],
              suspended: false,
              dailyLimit: result.dailyLimit ?? null,
              records: result.records,
            },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'DNS check failed');
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async () => {
    setConfirmRemove(false);
    await removeDomain(domainName);
    navigate('/domains');
  };

  if (!domain && !error) return <LoadingState message="Loading domain…" />;

  return (
    <div>
      <p>
        <Link to="/domains">Domains</Link> › {heading}
      </p>
      <Title>{heading}</Title>
      {domain ? (
        <Meta>
          {domain.state === 'verified' ? (
            <Badge variant="success">Verified</Badge>
          ) : domain.state === 'broken' ? (
            <Badge variant="error">Broken</Badge>
          ) : (
            <Badge variant="accent">Pending</Badge>
          )}{' '}
          Plan: {capLabel(domain.dailyLimit)}
        </Meta>
      ) : null}
      <p>Publish these records, then check.</p>
      {domain?.records ? <DnsRecordsTable records={domain.records} /> : null}
      {error ? <Alert variant="error">{error}</Alert> : null}
      <Actions>
        <Button type="button" onClick={onCheck} disabled={busy}>
          {busy ? 'Checking…' : 'Check DNS'}
        </Button>
        <Button type="button" variant="danger" onClick={() => setConfirmRemove(true)}>
          Remove
        </Button>
      </Actions>
      <ConfirmDialog
        open={confirmRemove}
        title="Remove domain?"
        message={`Remove ${domainName}? Queued mail for this domain will be held until it expires.`}
        confirmLabel="Remove"
        variant="danger"
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => {
          void onRemove();
        }}
      />
    </div>
  );
}
