import { FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { Alert, Badge, Button, EmptyState, Input, LoadingState } from '@/design-system';
import {
  addSuppression,
  exportSuppressionsCsv,
  listSuppressions,
  removeSuppression,
} from '@/api/outbound';
import type { Suppression } from '@/api/types';

const Title = styled.h1`
  margin: 0 0 ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.typography.fontSize['2xl']};
`;

const Row = styled.form`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  flex-wrap: wrap;
`;

const List = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
`;

const Item = styled.li<{ $highlighted?: boolean }>`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
  border: 1px solid
    ${({ theme, $highlighted }) => ($highlighted ? theme.colors.primary : theme.colors.border)};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ theme, $highlighted }) =>
    $highlighted ? theme.colors.primaryLight : 'transparent'};
`;

const ItemInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
`;

const ItemHeader = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  flex-wrap: wrap;
`;

const EmailText = styled.span`
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  word-break: break-all;
`;

const MetaText = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.text.secondary};
  word-break: break-word;
`;

function formatTime(value: number | undefined): string | null {
  if (!value) return null;
  return new Date(value).toISOString().replace('T', ' ').slice(0, 19) + 'Z';
}

export function Suppressions() {
  const [searchParams, setSearchParams] = useSearchParams();
  const targetEmail = (searchParams.get('email') || '').trim().toLowerCase();
  const [items, setItems] = useState<Suppression[] | null>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [removingEmail, setRemovingEmail] = useState<string | null>(null);

  const refresh = async () => {
    setItems(await listSuppressions());
  };

  useEffect(() => {
    void refresh().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, []);

  const onAdd = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await addSuppression(email.trim());
      setEmail('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add suppression');
    }
  };

  const onRemove = async (target: string) => {
    setError(null);
    setRemovingEmail(target);
    try {
      await removeSuppression(target);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove suppression');
    } finally {
      setRemovingEmail(null);
    }
  };

  const onExport = async () => {
    const csv = await exportSuppressionsCsv();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'suppressions.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (error && !items) return <Alert variant="error">{error}</Alert>;
  if (!items) return <LoadingState message="Loading suppressions…" />;

  const targetMissing =
    Boolean(targetEmail) && !items.some((item) => item.email.toLowerCase() === targetEmail);

  return (
    <div>
      <Title>Suppressions</Title>
      <Row onSubmit={onAdd}>
        <Input
          aria-label="Email to suppress"
          placeholder="bad@example.org"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit">Add</Button>
        <Button type="button" variant="secondary" onClick={() => void onExport()}>
          Export CSV
        </Button>
      </Row>
      {error ? <Alert variant="error">{error}</Alert> : null}
      {targetMissing ? (
        <Alert variant="info">
          {targetEmail} is not currently on the suppression list.{' '}
          <Button type="button" variant="ghost" size="sm" onClick={() => setSearchParams({})}>
            Clear
          </Button>
        </Alert>
      ) : null}
      {items.length === 0 ? (
        <EmptyState title="No suppressions" description="5xx bounces and manual entries appear here." />
      ) : (
        <List>
          {items.map((item) => {
            const added = formatTime(item.addedAt ?? item.added_at);
            const highlighted = Boolean(targetEmail) && item.email.toLowerCase() === targetEmail;
            return (
              <Item key={item.email} $highlighted={highlighted} data-highlighted={highlighted || undefined}>
                <ItemInfo>
                  <ItemHeader>
                    <EmailText>{item.email}</EmailText>
                    <Badge variant={item.reason === 'hard_bounce' ? 'error' : 'default'}>
                      {item.reason}
                    </Badge>
                  </ItemHeader>
                  {item.errorMessage ? <MetaText>{item.errorMessage}</MetaText> : null}
                  {added ? <MetaText>Added {added}</MetaText> : null}
                </ItemInfo>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  aria-label={`Remove ${item.email}`}
                  disabled={removingEmail === item.email}
                  onClick={() => void onRemove(item.email)}
                >
                  {removingEmail === item.email ? 'Removing…' : 'Remove'}
                </Button>
              </Item>
            );
          })}
        </List>
      )}
    </div>
  );
}
