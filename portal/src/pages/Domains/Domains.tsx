import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { Alert, Badge, Button, EmptyState, Input, LoadingState } from '@/design-system';
import { addDomain, listDomains } from '@/api/outbound';
import type { Domain } from '@/api/types';

const Row = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  flex-wrap: wrap;
`;

const List = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const Item = styled.li`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
`;

const Title = styled.h1`
  margin: 0 0 ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.typography.fontSize['2xl']};
`;

function stateBadge(domain: Domain) {
  if (domain.suspended) return <Badge variant="error">Suspended</Badge>;
  if (domain.state === 'verified') return <Badge variant="success">Verified</Badge>;
  if (domain.state === 'broken') return <Badge variant="error">Broken</Badge>;
  return <Badge variant="accent">Pending</Badge>;
}

export function Domains() {
  const navigate = useNavigate();
  const [domains, setDomains] = useState<Domain[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      setDomains(await listDomains());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load domains');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const onAdd = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const created = await addDomain(name.trim());
      setName('');
      navigate(`/domains/${encodeURIComponent(created.domain)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add domain');
    }
  };

  if (loading) return <LoadingState message="Loading domains…" />;

  return (
    <div>
      <Title>Domains</Title>
      <Row as="form" onSubmit={onAdd}>
        <Input
          aria-label="Domain name"
          placeholder="mail.example.com"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit">Add domain</Button>
      </Row>
      {error ? <Alert variant="error">{error}</Alert> : null}
      {domains.length === 0 ? (
        <EmptyState title="No sending domains" description="Add a domain to publish DNS records." />
      ) : (
        <List>
          {domains.map((domain) => (
            <Item key={domain.domain}>
              <Link to={`/domains/${encodeURIComponent(domain.domain)}`}>{domain.domain}</Link>
              {stateBadge(domain)}
            </Item>
          ))}
        </List>
      )}
    </div>
  );
}
