import { FormEvent, useEffect, useState } from 'react';
import styled from 'styled-components';
import { Alert, Button, EmptyState, Input, LoadingState } from '@/design-system';
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

const Item = styled.li`
  display: flex;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.sm} 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

export function Suppressions() {
  const [items, setItems] = useState<Suppression[] | null>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

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
      {items.length === 0 ? (
        <EmptyState title="No suppressions" description="Hard bounces and manual entries appear here." />
      ) : (
        <List>
          {items.map((item) => (
            <Item key={item.email}>
              <span>
                {item.email} · {item.reason}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  void removeSuppression(item.email).then(refresh);
                }}
              >
                Remove
              </Button>
            </Item>
          ))}
        </List>
      )}
    </div>
  );
}
