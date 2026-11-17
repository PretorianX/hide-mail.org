import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import {
  Alert,
  Button,
  ConfirmDialog,
  EmptyState,
  Input,
  LoadingState,
} from '@/design-system';
import {
  AdminLicense,
  adminLogout,
  createAdminLicense,
  deleteAdminLicense,
  listAdminLicenses,
  listLicenseTypes,
} from '@/api/admin';

const Page = styled.main`
  max-width: 960px;
  margin: 0 auto;
  padding: ${({ theme }) => theme.spacing.xl};
`;

const Header = styled.header`
  display: flex;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.md};
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const Title = styled.h1`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSize['2xl']};
`;

const Form = styled.form`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: ${({ theme }) => theme.spacing.sm};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const Select = styled.select`
  padding: ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text.primary};
`;

const Revealed = styled.pre`
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  overflow-x: auto;
`;

const Row = styled.li`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.sm} 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const Meta = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.text.secondary};
`;

export function OpsKeys() {
  const navigate = useNavigate();
  const [licenses, setLicenses] = useState<AdminLicense[] | null>(null);
  const [types, setTypes] = useState<string[]>([]);
  const [type, setType] = useState('outbound');
  const [days, setDays] = useState('30');
  const [label, setLabel] = useState('');
  const [ratePerMinute, setRatePerMinute] = useState('');
  const [dailyLimitDefault, setDailyLimitDefault] = useState('');
  const [revealed, setRevealed] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    const [list, typeList] = await Promise.all([listAdminLicenses(), listLicenseTypes()]);
    setLicenses(list);
    setTypes(typeList);
    if (typeList.length && !typeList.includes(type)) {
      setType(typeList[0]);
    }
  };

  useEffect(() => {
    void refresh().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, []);

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const created = await createAdminLicense({
        type,
        days: Number(days),
        label: label.trim() || undefined,
        ratePerMinute: ratePerMinute === '' ? undefined : Number(ratePerMinute),
        dailyLimitDefault:
          dailyLimitDefault.trim() === '' || dailyLimitDefault.trim() === 'unlimited'
            ? 'unlimited'
            : Number(dailyLimitDefault),
      });
      setRevealed(created.key || null);
      setLabel('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create key');
    }
  };

  const onDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteAdminLicense(deleteId);
      setDeleteId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete key');
    }
  };

  const onLogout = async () => {
    await adminLogout();
    navigate('/ops/login', { replace: true });
  };

  if (!licenses && !error) return <LoadingState message="Loading licences…" />;

  return (
    <Page>
      <Header>
        <div>
          <Title>API keys</Title>
          <p>List shows masks only. Plaintext is shown once on create.</p>
        </div>
        <Button type="button" variant="ghost" onClick={onLogout}>
          Sign out
        </Button>
      </Header>

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Form onSubmit={onCreate}>
        <Select aria-label="Permission type" value={type} onChange={(e) => setType(e.target.value)}>
          {types.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </Select>
        <Input
          aria-label="Validity days"
          type="number"
          min={1}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          required
        />
        <Input
          aria-label="Label"
          placeholder="Label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        {type === 'outbound' ? (
          <>
            <Input
              aria-label="Rate per minute"
              type="number"
              min={1}
              placeholder="rate/min"
              value={ratePerMinute}
              onChange={(e) => setRatePerMinute(e.target.value)}
            />
            <Input
              aria-label="Daily limit default"
              placeholder="blank = unlimited"
              value={dailyLimitDefault}
              onChange={(e) => setDailyLimitDefault(e.target.value)}
              helperText="Leave blank for no daily cap, or enter a positive number."
            />
          </>
        ) : null}
        <Button type="submit">Generate key</Button>
      </Form>

      {revealed ? (
        <Alert variant="warning">
          Copy this key now — it will not be shown again.
          <Revealed>{revealed}</Revealed>
        </Alert>
      ) : null}

      {!licenses?.length ? (
        <EmptyState title="No licences yet" description="Generate a key to get started." />
      ) : (
        <ul>
          {licenses.map((license) => (
            <Row key={license.id}>
              <div>
                <strong>{license.maskedKey}</strong>
                <Meta>
                  {license.type}
                  {license.label ? ` · ${license.label}` : ''}
                  {` · ${license.remainingDays}d left`}
                  {license.ratePerMinute != null ? ` · ${license.ratePerMinute}/min` : ''}
                  {license.dailyLimitDefault === null || license.dailyLimitDefault === undefined
                    ? ' · daily unlimited'
                    : ` · daily ${license.dailyLimitDefault}`}
                </Meta>
              </div>
              <Button type="button" variant="ghost" onClick={() => setDeleteId(license.id)}>
                Delete
              </Button>
            </Row>
          ))}
        </ul>
      )}

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
    </Page>
  );
}
