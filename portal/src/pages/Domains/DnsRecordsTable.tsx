import { useState } from 'react';
import styled from 'styled-components';
import { Badge, CopyIcon, IconButton } from '@/design-system';
import type { DomainRecord } from '@/api/types';

const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Card = styled.li`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  padding: ${({ theme }) => theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
  min-width: 0;
`;

const CardHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.sm};
  flex-wrap: wrap;
`;

const Purpose = styled.span`
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
`;

const TypeBadge = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono || 'ui-monospace, monospace'};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.text.secondary};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: 0.15rem 0.45rem;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 0;
`;

const FieldLabel = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.text.secondary};
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const FieldRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing.sm};
  min-width: 0;
`;

const MonoValue = styled.code`
  flex: 1 1 auto;
  min-width: 0;
  display: block;
  padding: ${({ theme }) => theme.spacing.sm};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.border};
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
`;

const Notes = styled.ul`
  margin: ${({ theme }) => theme.spacing.md} 0 0;
  padding-left: ${({ theme }) => theme.spacing.lg};
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
`;

const ReasonList = styled.ul`
  margin: ${({ theme }) => theme.spacing.sm} 0 0;
  padding-left: ${({ theme }) => theme.spacing.lg};
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
`;

function purposeLabel(record: DomainRecord): string {
  if (record.purpose) return record.purpose;
  if (record.id === 'dkim') return 'DKIM signing';
  if (record.id === 'returnPath') return 'Bounce / Return-Path';
  if (record.id === 'spf') return 'SPF (authorize Hide Mail)';
  if (record.id === 'dmarc') return 'DMARC policy';
  return 'DNS record';
}

function recordValue(record: DomainRecord): string {
  if (record.value != null && record.value !== '') return String(record.value);
  if (record.expected != null && record.expected !== '') return String(record.expected);
  if (record.id === 'dmarc') return 'v=DMARC1; p=none;';
  return '';
}

function statusLabel(record: DomainRecord): { text: string; variant: 'success' | 'error' | 'default' } {
  if (record.status === 'pass') return { text: '✓', variant: 'success' };
  if (record.status === 'fail' || record.reason) return { text: '✗', variant: 'error' };
  return { text: '·', variant: 'default' };
}

function CopyableField({
  label,
  value,
  copyLabel,
}: {
  label: string;
  value: string;
  copyLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  if (!value) {
    return (
      <Field>
        <FieldLabel>{label}</FieldLabel>
        <MonoValue>—</MonoValue>
      </Field>
    );
  }

  const onCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <FieldRow>
        <MonoValue data-testid={`dns-${label.toLowerCase()}-value`}>{value}</MonoValue>
        <IconButton
          type="button"
          size="sm"
          aria-label={copied ? `${copyLabel} copied` : `Copy ${copyLabel}`}
          onClick={() => {
            void onCopy();
          }}
          data-testid={`copy-dns-${label.toLowerCase()}`}
        >
          {copied ? '✓' : <CopyIcon size={16} />}
        </IconButton>
      </FieldRow>
    </Field>
  );
}

export function DnsRecordsTable({ records }: { records: DomainRecord[] }) {
  return (
    <>
      <List>
        {records.map((record) => {
          const status = statusLabel(record);
          const host = record.host || '';
          const value = recordValue(record);
          return (
            <Card key={record.id || `${record.type}-${record.host}`}>
              <CardHeader>
                <Purpose>{purposeLabel(record)}</Purpose>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <TypeBadge>{record.type || '—'}</TypeBadge>
                  <Badge variant={status.variant}>{status.text}</Badge>
                </div>
              </CardHeader>
              <CopyableField label="Host" value={host} copyLabel="host" />
              <CopyableField label="Value" value={value} copyLabel="value" />
            </Card>
          );
        })}
      </List>
      <Notes>
        <li>
          <strong>Bounce / Return-Path:</strong> CNAME <code>hm-bounce.&lt;your-domain&gt;</code> to
          Hide Mail&apos;s return-path host (<code>rp.hide-mail.org</code>; rp means return-path)
          so bounce notices for this domain are delivered to us.
        </li>
        <li>
          <strong>SPF:</strong> apex TXT must include <code>include:_spf.hide-mail.org</code> so
          receivers authorize Hide Mail&apos;s sending hosts. If you already have SPF, add that
          include to the existing record (do not publish a second <code>v=spf1</code>).
        </li>
        <li>
          <strong>DMARC:</strong> publish the suggested TXT if you do not already have one. An existing
          valid <code>v=DMARC1</code> policy also passes the check.
        </li>
      </Notes>
      <ReasonList>
        {records.flatMap((record) => {
          const lines: string[] = [];
          if (record.reason && record.status !== 'pass') {
            lines.push(`${record.host || record.id}: ${String(record.reason).replace(/_/g, ' ')}`);
          }
          for (const ns of record.nameserverAnswers || record.nameservers || []) {
            if (ns.matched) continue;
            const shown =
              Array.isArray(ns.value) ? ns.value.join(' ') : ns.value == null ? 'returned nothing' : String(ns.value);
            lines.push(`${record.host || record.id}: ${ns.nameserver} ${shown}`);
          }
          return lines.map((line) => <li key={line}>{line}</li>);
        })}
      </ReasonList>
    </>
  );
}
