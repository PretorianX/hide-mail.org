import { FormEvent, useEffect, useState } from 'react';
import styled from 'styled-components';
import { Alert, Button, ConfirmDialog, EmptyState, Input, LoadingState } from '@/design-system';
import { createSendKey, listSendKeys, revokeSendKey } from '@/api/outbound';
import type { SendKeyMeta } from '@/api/types';

const Title = styled.h1`
  margin: 0 0 ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.typography.fontSize['2xl']};
`;

const Revealed = styled.pre`
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  overflow-x: auto;
`;

const Row = styled.form`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const Item = styled.li`
  display: flex;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.sm} 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

export function ApiKeys() {
  const [keys, setKeys] = useState<SendKeyMeta[] | null>(null);
  const [name, setName] = useState('');
  const [revealed, setRevealed] = useState<string | null>(null);
  const [revokeName, setRevokeName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => setKeys(await listSendKeys());

  useEffect(() => {
    void refresh().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, []);

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const created = await createSendKey(name.trim());
      setRevealed(created.key);
      setName('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create key');
    }
  };

  if (!keys && !error) return <LoadingState message="Loading API keys…" />;

  return (
    <div>
      <Title>API keys</Title>
      <p>Send keys (hm_send_…) authenticate POST /api/outbound/messages. Shown once on create.</p>
      <Row onSubmit={onCreate}>
        <Input
          aria-label="Key name"
          placeholder="production"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit">Create</Button>
      </Row>
      {revealed ? (
        <Alert variant="warning">
          Copy this key now — it will not be shown again.
          <Revealed>{revealed}</Revealed>
        </Alert>
      ) : null}
      {error ? <Alert variant="error">{error}</Alert> : null}
      {!keys || keys.length === 0 ? (
        <EmptyState title="No send keys" description="Create a named key for your integration." />
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {keys.map((key) => (
            <Item key={key.name}>
              <span>
                {key.name} · {key.maskedKey}
              </span>
              <Button type="button" variant="danger" size="sm" onClick={() => setRevokeName(key.name)}>
                Revoke
              </Button>
            </Item>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={Boolean(revokeName)}
        title="Revoke send key?"
        message={`Revoke “${revokeName}”? Integrations using it will fail immediately.`}
        confirmLabel="Revoke"
        variant="danger"
        onCancel={() => setRevokeName(null)}
        onConfirm={() => {
          if (!revokeName) return;
          void revokeSendKey(revokeName)
            .then(refresh)
            .finally(() => setRevokeName(null));
        }}
      />
    </div>
  );
}
