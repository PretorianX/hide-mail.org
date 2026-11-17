import { useEffect } from 'react';
import styled from 'styled-components';
import { Badge, Button, IconButton } from '@/design-system';
import type { AdminLicense } from '@/api/admin';

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
  width: min(440px, 100vw);
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

function dash(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

function formatTime(value: number): string {
  return new Date(value).toISOString().replace('T', ' ').slice(0, 19) + 'Z';
}

function dailyLabel(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'unlimited';
  return String(value);
}

function statusBadge(status: string) {
  if (status === 'active') return <Badge variant="success">{status}</Badge>;
  if (status === 'expired' || status === 'revoked') return <Badge variant="error">{status}</Badge>;
  return <Badge variant="default">{status}</Badge>;
}

type Props = {
  license: AdminLicense;
  onClose: () => void;
  onDelete: (id: string) => void;
};

export function OpsLicenseDetailDrawer({ license, onClose, onDelete }: Props) {
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
      <Panel role="dialog" aria-modal="true" aria-label="Licence detail">
        <Header>
          <Title>Licence detail</Title>
          <IconButton aria-label="Close detail" onClick={onClose}>
            ×
          </IconButton>
        </Header>
        <Body>
          <Field>
            <Label>Status</Label>
            <Value>{statusBadge(license.status)}</Value>
          </Field>
          <Field>
            <Label>Masked key</Label>
            <Value>{license.maskedKey}</Value>
          </Field>
          <Field>
            <Label>Type</Label>
            <Value>{license.type}</Value>
          </Field>
          <Field>
            <Label>Label</Label>
            <Value>{dash(license.label)}</Value>
          </Field>
          <Field>
            <Label>Plan</Label>
            <Value>{dash(license.plan)}</Value>
          </Field>
          <Field>
            <Label>Account id</Label>
            <Value>{dash(license.accountId)}</Value>
          </Field>
          <Field>
            <Label>Rate / min</Label>
            <Value>{license.ratePerMinute != null ? `${license.ratePerMinute}/min` : '—'}</Value>
          </Field>
          <Field>
            <Label>Daily default</Label>
            <Value>{dailyLabel(license.dailyLimitDefault)}</Value>
          </Field>
          <Field>
            <Label>Remaining</Label>
            <Value>{license.remainingDays}d</Value>
          </Field>
          <Field>
            <Label>Created</Label>
            <Value>{formatTime(license.createdAt)}</Value>
          </Field>
          <Field>
            <Label>Expires</Label>
            <Value>{formatTime(license.expiresAt)}</Value>
          </Field>
          <Field>
            <Label>Admin id</Label>
            <Value>{license.id}</Value>
          </Field>
          <Button type="button" variant="danger" onClick={() => onDelete(license.id)}>
            Delete licence
          </Button>
        </Body>
      </Panel>
    </>
  );
}
