import { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { Alert, Button, LoadingState } from '@/design-system';
import { getMetricsTokenMeta, rotateMetricsToken } from '@/api/outbound';
import type { ScrapeConfig } from '@/api/types';

const Title = styled.h1`
  margin: 0 0 ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.typography.fontSize['2xl']};
`;

const Code = styled.pre`
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  overflow-x: auto;
  white-space: pre-wrap;
`;

function scrapeConfigYaml(config: ScrapeConfig): string {
  const target = config.static_configs?.[0]?.targets?.[0] || 'hide-mail.org';

  const bearer =
    config.authorization?.credentials ||
    (config.bearerTokenHeader ? '<rotate to reveal>' : '<token>');
  return [
    'scrape_configs:',
    `  - job_name: ${config.job_name}`,
    `    metrics_path: ${config.metrics_path}`,
    `    scheme: ${config.scheme}`,
    '    static_configs:',
    '      - targets:',
    `          - ${target}`,
    '    authorization:',
    '      type: Bearer',
    `      credentials: ${bearer}`,
  ].join('\n');
}

export function Metrics() {
  const [meta, setMeta] = useState<{
    createdAt: number;
    maskedKey: string;
    scrapeConfig: ScrapeConfig;
  } | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [scrapeConfig, setScrapeConfig] = useState<ScrapeConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void getMetricsTokenMeta()
      .then((value) => {
        setMeta(value);
        if (value) setScrapeConfig(value.scrapeConfig);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoaded(true));
  }, []);

  const yaml = useMemo(
    () => (scrapeConfig ? scrapeConfigYaml(scrapeConfig) : ''),
    [scrapeConfig],
  );

  const onRotate = async () => {
    setError(null);
    try {
      const rotated = await rotateMetricsToken();
      setRevealed(rotated.key);
      setScrapeConfig(rotated.scrapeConfig);
      setMeta({
        createdAt: rotated.createdAt,
        maskedKey: `****${rotated.key.slice(-4)}`,
        scrapeConfig: rotated.scrapeConfig,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rotate token');
    }
  };

  if (!loaded) return <LoadingState message="Loading metrics token…" />;

  return (
    <div>
      <Title>Metrics</Title>
      <p>
        Scrape https://hide-mail.org/api/outbound/metrics with a Bearer hm_metrics_… token.

      </p>
      {meta ? (
        <p>
          Current token: {meta.maskedKey} (created {new Date(meta.createdAt).toISOString()})
        </p>
      ) : (
        <p>No metrics token issued yet.</p>
      )}
      <Button type="button" onClick={() => void onRotate()}>
        {meta ? 'Rotate token' : 'Create token'}
      </Button>
      {revealed ? (
        <Alert variant="warning">
          Copy this token now — it will not be shown again.
          <Code>{revealed}</Code>
        </Alert>
      ) : null}
      {yaml ? (
        <>
          <h2>scrape_config</h2>
          <Code data-testid="scrape-config">{yaml}</Code>
        </>
      ) : null}
      {error ? <Alert variant="error">{error}</Alert> : null}
    </div>
  );
}
