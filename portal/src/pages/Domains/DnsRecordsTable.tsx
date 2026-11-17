import styled from 'styled-components';
import { Badge } from '@/design-system';
import type { DomainRecord } from '@/api/types';

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
    word-break: break-word;
  }

  th {
    color: ${({ theme }) => theme.colors.text.secondary};
    font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  }
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
  if (record.id === 'dmarc') return 'DMARC policy';
  return '—';
}

function recordValue(record: DomainRecord): string {
  if (record.value != null && record.value !== '') return String(record.value);
  if (record.expected != null && record.expected !== '') return String(record.expected);
  if (record.id === 'dmarc') return 'v=DMARC1; p=none;';
  return '—';
}

function statusLabel(record: DomainRecord): { text: string; variant: 'success' | 'error' | 'default' } {
  if (record.status === 'pass') return { text: '✓', variant: 'success' };
  if (record.status === 'fail' || record.reason) return { text: '✗', variant: 'error' };
  return { text: '·', variant: 'default' };
}

export function DnsRecordsTable({ records }: { records: DomainRecord[] }) {
  return (
    <>
      <Table>
        <thead>
          <tr>
            <th>Purpose</th>
            <th>Type</th>
            <th>Host</th>
            <th>Value</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => {
            const status = statusLabel(record);
            return (
              <tr key={record.id || `${record.type}-${record.host}`}>
                <td>{purposeLabel(record)}</td>
                <td>{record.type || '—'}</td>
                <td>{record.host || '—'}</td>
                <td>{recordValue(record)}</td>
                <td>
                  <Badge variant={status.variant}>{status.text}</Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      <Notes>
        <li>
          <strong>Bounce / Return-Path:</strong> CNAME <code>hm-bounce.&lt;your-domain&gt;</code> to
          Hide Mail&apos;s return-path host (<code>rp.hide-mail.org</code>; rp means return-path)
          so bounce notices for this domain are delivered to us.
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
