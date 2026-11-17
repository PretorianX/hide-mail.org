import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { Alert, Button, Input } from '@/design-system';
import { getAccountSummary } from '@/api/outbound';
import { ApiError, setUnauthorizedHandler } from '@/api/client';
import {
  clearStoredLicense,
  isLicenseFormatValid,
  setStoredLicense,
} from '@/auth/license';

const Page = styled.main`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.xl};
  background: ${({ theme }) => theme.colors.background};
`;

const Panel = styled.form`
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Brand = styled.h1`
  margin: 0;
  font-family: ${({ theme }) => theme.typography.fontFamily.sans};
  font-size: ${({ theme }) => theme.typography.fontSize['3xl']};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  color: ${({ theme }) => theme.colors.text.primary};
`;

const Lead = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: ${({ theme }) => theme.typography.fontSize.md};
`;

export function Unlock() {
  const navigate = useNavigate();
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const trimmed = key.trim();
    if (!isLicenseFormatValid(trimmed)) {
      setError('Enter a licence key like HM-XXXX-XXXX-XXXX-XXXX.');
      return;
    }

    setBusy(true);
    setStoredLicense(trimmed);
    try {
      await getAccountSummary();
      setUnauthorizedHandler(() => {
        clearStoredLicense();
        navigate('/unlock', { replace: true });
      });
      navigate('/overview', { replace: true });
    } catch (err) {
      clearStoredLicense();
      if (err instanceof ApiError) {
        setError(err.message || 'Licence key rejected.');
      } else {
        setError('Could not reach the Send API.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <Panel onSubmit={onSubmit}>
        <Brand>Send</Brand>
        <Lead>Paste your Hide Mail Send licence key to unlock the portal.</Lead>
        <Input
          aria-label="Licence key"
          placeholder="HM-XXXX-XXXX-XXXX-XXXX"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        {error ? <Alert variant="error">{error}</Alert> : null}
        <Button type="submit" disabled={busy}>
          {busy ? 'Unlocking…' : 'Unlock'}
        </Button>
      </Panel>
    </Page>
  );
}
