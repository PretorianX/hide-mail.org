import { useEffect } from 'react';
import styled from 'styled-components';
import { Badge, IconButton } from '@/design-system';
import type { ActivityMessage } from '@/api/types';

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: ${({ theme }) => theme.zIndex.modal};
  background: ${({ theme }) => theme.colors.overlay};
`;

const Panel = styled.aside`
  position: fixed;
  top: 0;
  right: 0;
  z-index: ${({ theme }) => theme.zIndex.modal + 1};
  width: min(420px, 100vw);
  height: 100vh;
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text.primary};
  border-left: 1px solid ${({ theme }) => theme.colors.border};
  box-shadow: ${({ theme }) => theme.shadows.xl};
  display: flex;
  flex-direction: column;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.lg};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const Title = styled.h2`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSize.lg};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
`;

const Body = styled.div`
  padding: ${({ theme }) => theme.spacing.lg};
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const Label = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.text.secondary};
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const Value = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  word-break: break-word;
`;

function dash(value: string | null | undefined): string {
  return value && value.trim() ? value : '—';
}

function formatFrom(from: ActivityMessage['from']): string {
  if (!from?.email) return '—';
  if (from.name) return `${from.name} <${from.email}>`;
  return from.email;
}

function formatTime(value: number | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toISOString().replace('T', ' ').slice(0, 19) + 'Z';
}

function statusBadge(status: string) {
  if (status === 'delivered') return <Badge variant="success">{status}</Badge>;
  if (status === 'bounced' || status === 'held') return <Badge variant="error">{status}</Badge>;
  if (status === 'deferred') return <Badge variant="accent">{status}</Badge>;
  return <Badge variant="default">{status}</Badge>;
}

type Props = {
  message: ActivityMessage;
  onClose: () => void;
};

export function ActivityDetailDrawer({ message, onClose }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <Overlay onClick={onClose} aria-hidden="true" />
      <Panel role="dialog" aria-modal="true" aria-label="Message detail">
        <Header>
          <Title>Message detail</Title>
          <IconButton aria-label="Close detail" onClick={onClose}>
            ×
          </IconButton>
        </Header>
        <Body>
          <Field>
            <Label>Status</Label>
            <Value>{statusBadge(message.status)}</Value>
          </Field>
          <Field>
            <Label>Subject</Label>
            <Value>{dash(message.subject)}</Value>
          </Field>
          <Field>
            <Label>Header From</Label>
            <Value>{formatFrom(message.from)}</Value>
          </Field>
          <Field>
            <Label>Envelope From</Label>
            <Value>{dash(message.envelopeFrom)}</Value>
          </Field>
          <Field>
            <Label>Recipient</Label>
            <Value>{message.recipient}</Value>
          </Field>
          <Field>
            <Label>Domain</Label>
            <Value>{message.domain}</Value>
          </Field>
          <Field>
            <Label>Request IP</Label>
            <Value>{dash(message.clientIp)}</Value>
          </Field>
          <Field>
            <Label>Send key</Label>
            <Value>{dash(message.sendKeyName)}</Value>
          </Field>
          <Field>
            <Label>Last response</Label>
            <Value>{dash(message.lastResponse)}</Value>
          </Field>
          <Field>
            <Label>Reference</Label>
            <Value>{dash(message.reference)}</Value>
          </Field>
          <Field>
            <Label>Message id</Label>
            <Value>{message.id}</Value>
          </Field>
          <Field>
            <Label>Created</Label>
            <Value>{formatTime(message.createdAt)}</Value>
          </Field>
          <Field>
            <Label>Updated</Label>
            <Value>{formatTime(message.lastEventAt || message.createdAt)}</Value>
          </Field>
        </Body>
      </Panel>
    </>
  );
}
