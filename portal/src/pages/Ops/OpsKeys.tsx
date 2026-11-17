import { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Input,
  LoadingState,
} from '@/design-system';
import {
  AdminLicense,
  createAdminLicense,
  deleteAdminLicense,
  listAdminLicenses,
  listLicenseTypes,
} from '@/api/admin';
import { FEATURE_CATALOG, type FeatureDef } from './featureCatalog';
import { OpsLicenseDetailDrawer } from './OpsLicenseDetailDrawer';
import { filterOpsLicenses, summarizeOpsLicenses } from './filterOpsLicenses';

const Title = styled.h1`
  margin: 0 0 ${({ theme }) => theme.spacing.xs};
  font-size: ${({ theme }) => theme.typography.fontSize['2xl']};
`;

const Lead = styled.p`
  margin: 0 0 ${({ theme }) => theme.spacing.lg};
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const Summary = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const Panel = styled.section`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  padding: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.colors.surface};
`;

const PanelTitle = styled.h2`
  margin: 0 0 ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.typography.fontSize.lg};
`;

const Controls = styled.div`
  display: grid;
  grid-template-columns: 140px minmax(180px, 1fr);
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const FeatureGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: ${({ theme }) => theme.spacing.sm};
`;

const FeatureButton = styled.button`
  text-align: left;
  padding: ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text.primary};
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.text.secondary};
  }

  &:disabled {
    opacity: 0.6;
    cursor: wait;
  }
`;

const FeatureLabel = styled.div`
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  margin-bottom: 4px;
`;

const FeatureDesc = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const Select = styled.select`
  height: 44px;
  padding: 0 ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text.primary};
`;

const Toolbar = styled.div`
  display: grid;
  grid-template-columns: minmax(200px, 1fr) auto auto;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

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
  }

  tbody tr {
    cursor: pointer;
  }

  tbody tr:hover,
  tbody tr[aria-selected='true'] {
    background: rgba(0, 0, 0, 0.03);
  }
`;

const Revealed = styled.pre`
  margin: ${({ theme }) => theme.spacing.sm} 0 0;
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
`;

type RevealedSecrets = {
  featureLabel: string;
  licenseKey?: string;
  apiKey?: string;
  sendKey?: string;
  sendKeyName?: string;
};

function statusBadge(status: string) {
  if (status === 'active') return <Badge variant="success">{status}</Badge>;
  if (status === 'expired' || status === 'revoked') return <Badge variant="error">{status}</Badge>;
  return <Badge variant="default">{status}</Badge>;
}

function dailyLabel(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'unlimited';
  return String(value);
}

function formatExpiry(license: AdminLicense): string {
  return `${license.remainingDays}d · ${new Date(license.expiresAt).toISOString().slice(0, 10)}`;
}

function formatReveal(secrets: RevealedSecrets): string {
  const lines: string[] = [`Feature: ${secrets.featureLabel}`];
  if (secrets.apiKey) lines.push(`API key: ${secrets.apiKey}`);
  if (secrets.sendKey) {
    lines.push(`Send key (${secrets.sendKeyName || 'default'}): ${secrets.sendKey}`);
  }
  if (secrets.licenseKey) lines.push(`Licence: ${secrets.licenseKey}`);
  return lines.join('\n');
}

export function OpsKeys() {
  const [licenses, setLicenses] = useState<AdminLicense[] | null>(null);
  const [types, setTypes] = useState<string[]>([]);
  const [days, setDays] = useState('30');
  const [label, setLabel] = useState('');
  const [busyType, setBusyType] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState<AdminLicense | null>(null);
  const [revealed, setRevealed] = useState<RevealedSecrets | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    const [list, typeList] = await Promise.all([listAdminLicenses(), listLicenseTypes()]);
    setLicenses(list);
    setTypes(typeList);
  };

  useEffect(() => {
    void refresh().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, []);

  const summary = useMemo(() => summarizeOpsLicenses(licenses || []), [licenses]);
  const filtered = useMemo(
    () =>
      filterOpsLicenses(licenses || [], {
        query,
        type: typeFilter,
        status: statusFilter,
      }),
    [licenses, query, typeFilter, statusFilter],
  );

  const features = useMemo(
    () => FEATURE_CATALOG.filter((feature) => types.includes(feature.type)),
    [types],
  );

  const onGenerate = async (feature: FeatureDef) => {
    setError(null);
    const parsedDays = Number(days);
    if (!Number.isInteger(parsedDays) || parsedDays <= 0) {
      setError('Validity days must be a positive integer.');
      return;
    }
    setBusyType(feature.type);
    try {
      const created = await createAdminLicense({
        type: feature.type,
        days: parsedDays,
        label: label.trim() || undefined,
        issueSendKey: feature.issuesSendKey,
      });
      setRevealed({
        featureLabel: feature.label,
        licenseKey: created.key,
        apiKey: created.apiKey,
        sendKey: created.sendKey,
        sendKeyName: created.sendKeyName,
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create key');
    } finally {
      setBusyType(null);
    }
  };

  const onDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteAdminLicense(deleteId);
      setDeleteId(null);
      setSelected(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete key');
    }
  };

  if (!licenses && !error) return <LoadingState message="Loading licences…" />;

  return (
    <div>
      <Title>Licences</Title>
      <Lead>
        One click per product. Set duration first (default 30 days). Usable API/send keys are shown
        once; the list stays masked.
      </Lead>

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Summary data-testid="ops-summary">
        <span>{summary.total} licences</span>
        <span>{summary.active} active</span>
        {Object.entries(summary.byType).map(([key, count]) => (
          <span key={key}>
            {key}: {count}
          </span>
        ))}
      </Summary>

      <Panel>
        <PanelTitle>Generate</PanelTitle>
        <Controls>
          <Field>
            Validity (days)
            <Input
              aria-label="Validity days"
              type="number"
              min={1}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              required
            />
          </Field>
          <Field>
            Label
            <Input
              aria-label="Label"
              placeholder="optional customer or project"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </Field>
        </Controls>
        <FeatureGrid>
          {features.map((feature) => (
            <FeatureButton
              key={feature.type}
              type="button"
              disabled={busyType !== null}
              onClick={() => void onGenerate(feature)}
              aria-label={feature.label}
            >
              <FeatureLabel>
                {busyType === feature.type ? 'Generating…' : feature.label}
              </FeatureLabel>
              <FeatureDesc>{feature.description}</FeatureDesc>
            </FeatureButton>
          ))}
        </FeatureGrid>
      </Panel>

      {revealed ? (
        <Alert variant="warning">
          Copy this key now — it will not be shown again.
          <Revealed>{formatReveal(revealed)}</Revealed>
        </Alert>
      ) : null}

      <Toolbar>
        <Input
          type="search"
          role="searchbox"
          aria-label="Search licences"
          placeholder="Search mask, label, account, type…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Select
          aria-label="Filter by type"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="all">All types</option>
          {types.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="active">active</option>
          <option value="expired">expired</option>
          <option value="revoked">revoked</option>
        </Select>
      </Toolbar>

      {!licenses?.length ? (
        <EmptyState title="No licences yet" description="Generate a key to get started." />
      ) : filtered.length === 0 ? (
        <EmptyState title="No matches" description="Try a different search or filter." />
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Mask</th>
              <th>Type</th>
              <th>Label</th>
              <th>Account</th>
              <th>Rate</th>
              <th>Daily</th>
              <th>Expires</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((license) => (
              <tr
                key={license.id}
                tabIndex={0}
                aria-selected={selected?.id === license.id}
                aria-label={`${license.status} ${license.maskedKey} ${license.label || ''}`}
                onClick={() => setSelected(license)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelected(license);
                  }
                }}
              >
                <td>{statusBadge(license.status)}</td>
                <td>{license.maskedKey}</td>
                <td>{license.type}</td>
                <td>{license.label || '—'}</td>
                <td>{license.accountId || '—'}</td>
                <td>{license.ratePerMinute != null ? `${license.ratePerMinute}/min` : '—'}</td>
                <td>{dailyLabel(license.dailyLimitDefault)}</td>
                <td>{formatExpiry(license)}</td>
                <td>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      setDeleteId(license.id);
                    }}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {selected ? (
        <OpsLicenseDetailDrawer
          license={selected}
          onClose={() => setSelected(null)}
          onDelete={(id) => {
            setDeleteId(id);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Delete licence key?"
        message="The key stops working immediately. This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          void onDelete();
        }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
