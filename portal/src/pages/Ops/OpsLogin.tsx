import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { Alert, Button, Input } from '@/design-system';
import { adminLogin } from '@/api/admin';

const Page = styled.main`
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: ${({ theme }) => theme.spacing.xl};
  background: linear-gradient(
    160deg,
    ${({ theme }) => theme.colors.background} 0%,
    ${({ theme }) => theme.colors.surface} 100%
  );
`;

const Card = styled.form`
  width: min(420px, 100%);
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Title = styled.h1`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSize['2xl']};
`;

export function OpsLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminLogin(email.trim(), password);
      navigate('/ops/keys', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <Card onSubmit={onSubmit}>
        <Title>Operator admin</Title>
        {error ? <Alert variant="error">{error}</Alert> : null}
        <Input
          type="email"
          aria-label="Admin email"
          placeholder="admin@hide-mail.org"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          type="password"
          aria-label="Admin password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Button type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </Card>
    </Page>
  );
}
