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

const ReasonList = styled.ul`
  margin: ${({ theme }) => theme.spacing.sm} 0 0;
  padding-left: ${({ theme }) => theme.spacing.lg};
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
`;

function recordValue(record: DomainRecord): string {
  if (record.value != null && record.value !== '') return String(record.value);
  if ('expected' in record && (record as { expected?: string | null }).expected != null) {
    return String((record as { expected?: string | null }).expected);
  }
  if (record.id === 'dmarc') return '(yours — any valid v=DMARC1)';
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
