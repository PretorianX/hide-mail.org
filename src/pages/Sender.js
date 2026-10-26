import React, { useEffect, useState } from 'react';
import SenderService from '../services/SenderService';
import SenderOffer from './SenderOffer';
import './Sender.css';

const EMPTY_SLOTS = [
  { id: 'mx', name: 'MX' },
  { id: 'spf', name: 'SPF' },
  { id: 'dmarc', name: 'DMARC' },
];

const Sender = () => {
  const [domain, setDomain] = useState('');
  const [dkimSelector, setDkimSelector] = useState('');
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copiedMode, setCopiedMode] = useState(null);

  useEffect(() => {
    if (!error && !report) {
      return undefined;
    }
    const target = document.querySelector(error ? '[role="alert"]' : '[data-testid="sender-result"]');
    if (typeof target?.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    return undefined;
  }, [error, report]);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    if (!domain.trim()) {
      setReport(null);
      setError('Enter a domain name.');
      return;
    }
    setBusy(true);
    try {
      const trimmedSelector = dkimSelector.trim();
      const next = trimmedSelector
        ? await SenderService.check(domain, trimmedSelector)
        : await SenderService.check(domain);
      setReport(next);
    } catch (err) {
      setReport(null);
      setError(err.message || 'Sender Check could not look up that domain.');
    } finally {
      setBusy(false);
    }
  };

  const onLoadSample = () => {
    setDomain('example.com');
    setError(null);
  };

  const copyText = async (text, mode) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
      setCopiedMode(mode);
      setTimeout(() => setCopiedMode(null), 2000);
    } catch (_) {
      setCopiedMode(null);
    }
  };

  const onCopyJson = () => {
    if (!report) return;
    copyText(JSON.stringify(report, null, 2), 'json');
  };

  const onCopyCurl = () => {
    const bodyObj = { domain: domain.trim() || 'example.com' };
    if (dkimSelector.trim()) {
      bodyObj.dkimSelector = dkimSelector.trim();
    }
    const payload = JSON.stringify(bodyObj);
    const snippet = `curl -X POST https://hide-mail.org/api/sender-check \\\n  -H "X-API-Key: hm_live_..." \\\n  -H "Content-Type: application/json" \\\n  -d '${payload.replace(/'/g, "'\\''")}'`;
    copyText(snippet, 'curl');
  };

  const slots = report ? report.records : EMPTY_SLOTS;
  const verdict = report ? report.verdict : null;
  const mxRecord = report?.records?.find((r) => r.id === 'mx');
  const spfRecord = report?.records?.find((r) => r.id === 'spf');
  const dmarcRecord = report?.records?.find((r) => r.id === 'dmarc');
  const dkimReport = report?.dkim || report?.transportAndBrand?.dkim;
  const transportAndBrand = report?.transportAndBrand;
  const spfLookupUsed = spfRecord?.parsed?.totalDnsLookups ?? spfRecord?.parsed?.dnsLookupCount ?? 0;
  const spfOverLimit = Boolean(
    spfRecord?.parsed?.overLookupLimit || spfRecord?.parsed?.exceedsLookupLimit || spfLookupUsed > (spfRecord?.parsed?.dnsLookupLimit || 10)
  );

  return (
    <main className="sender-page">
      <h1>Sender Check</h1>
      <p className="sender-lead">
        Enter a domain. Sender Check reads its MX, SPF, DMARC, DKIM, BIMI, MTA-STS, and TLS-RPT
        records and tells you whether receivers can enforce a sender policy. The name is not stored.
      </p>
      <div className="sender-work">
        <section
          className={`sender-policy-card${verdict ? ` sender-verdict-${verdict.toLowerCase()}` : ' sender-verdict-empty'}`}
          data-testid="sender-policy-card"
          aria-label="Sender policy"
        >
          <p className="sender-verdict" data-testid="sender-verdict">{verdict || '—'}</p>
          <ul className="sender-slots">
            {slots.map((slot) => (
              <li
                key={slot.id}
                className={`sender-slot${slot.status ? ` sender-slot-${slot.status}` : ''}`}
                data-testid={`sender-slot-${slot.id}`}
              >
                <span className="sender-slot-name">{slot.name}</span>
                <span className="sender-slot-detail">{slot.detail || '—'}</span>
              </li>
            ))}
          </ul>
        </section>
        <form className="sender-form" onSubmit={onSubmit}>
          <div className="sender-input-row">
            <div className="sender-field">
              <label htmlFor="sender-domain">Domain</label>
              <input
                id="sender-domain"
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
                spellCheck="false"
                autoComplete="off"
                inputMode="url"
                placeholder="example.com"
              />
            </div>
            <div className="sender-field sender-field-selector">
              <label htmlFor="sender-dkim-selector">DKIM selector</label>
              <input
                id="sender-dkim-selector"
                aria-label="DKIM selector"
                value={dkimSelector}
                onChange={(event) => setDkimSelector(event.target.value)}
                spellCheck="false"
                autoComplete="off"
                placeholder="Optional selector (e.g. google, s1)"
              />
            </div>
          </div>
          <div className="sender-actions">
            <button type="submit" className="sender-submit" disabled={busy}>
              {busy ? 'Checking…' : 'Check this domain'}
            </button>
            <button
              type="button"
              className="sender-sample-btn"
              onClick={onLoadSample}
              disabled={busy}
            >
              Load sample
            </button>
          </div>
          {error ? <p className="sender-error" role="alert">{error}</p> : null}
          {!report && !error ? (
            <p className="sender-empty" data-testid="sender-empty">
              Waiting for a domain. Nothing you type is stored.
            </p>
          ) : null}
        </form>
      </div>
      {report ? (
        <section className="sender-result" aria-live="polite" data-testid="sender-result">
          <div className="sender-result-header">
            <h2>{report.verdict}</h2>
            <div className="sender-export-bar">
              <button
                type="button"
                className="sender-export-btn"
                onClick={onCopyJson}
                data-testid="sender-copy-json"
              >
                {copiedMode === 'json' ? 'Copied JSON' : 'Copy JSON'}
              </button>
              <button
                type="button"
                className="sender-export-btn"
                onClick={onCopyCurl}
                data-testid="sender-copy-curl"
              >
                {copiedMode === 'curl' ? 'Copied curl' : 'Copy curl'}
              </button>
            </div>
          </div>
          <p>{report.summary}</p>
          <dl className="sender-published">
            {report.records.map((record) => (
              <div key={record.id}>
                <dt>{record.name}</dt>
                <dd>{record.record || 'Not published'}</dd>
              </div>
            ))}
          </dl>
          {mxRecord?.parsed ? (
            <section className="sender-detail-card" data-testid="sender-mx-details">
              <h3>MX Routing &amp; Provider Detection</h3>
              <p className="sender-detail-meta">
                <strong>Detected provider:</strong> {mxRecord.parsed.provider || 'Custom / Unrecognized'}
                {' · '}
                <strong>Exchanges:</strong> {mxRecord.parsed.exchangeCount}
                {mxRecord.parsed.nullMx ? ' (RFC 7505 Null MX)' : ''}
              </p>
              {mxRecord.parsed.exchanges?.length > 0 ? (
                <ul className="sender-breakdown-list">
                  {mxRecord.parsed.exchanges.map((ex, idx) => (
                    <li key={`${ex.exchange}-${idx}`}>
                      <code>Priority {ex.priority ?? 0}</code>
                      <span>{ex.exchange}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
          {spfRecord?.parsed ? (
            <section className="sender-detail-card" data-testid="sender-spf-details">
              <h3>SPF Mechanism &amp; Lookup Inspector</h3>
              <p className="sender-detail-meta">
                <strong>DNS Lookups:</strong>{' '}
                <span className={spfOverLimit ? 'sender-lookup-danger' : ''}>
                  {spfLookupUsed} / {spfRecord.parsed.dnsLookupLimit || 10} RFC 7208 limit
                </span>
                {spfRecord.parsed.totalDnsLookups !== undefined && spfRecord.parsed.totalDnsLookups !== spfRecord.parsed.dnsLookupCount ? (
                  <span> ({spfRecord.parsed.dnsLookupCount} top-level)</span>
                ) : null}
                {' · '}
                <strong>All policy:</strong> <code>{spfRecord.parsed.allQualifier || 'none'}</code>
              </p>
              {spfRecord.parsed.mechanisms?.length > 0 ? (
                <ul className="sender-breakdown-list">
                  {spfRecord.parsed.mechanisms.map((mech, idx) => (
                    <li key={`${mech.token}-${idx}`}>
                      <code>{mech.token}</code>
                      <span>
                        {mech.description}
                        {mech.causesDnsLookup ? ' (+1 DNS lookup)' : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {spfRecord.parsed.includeTree?.length > 0 ? (
                <div className="sender-spf-tree" data-testid="sender-spf-tree">
                  <h4>Recursive SPF Lookup Tree</h4>
                  <ul className="sender-breakdown-list">
                    {spfRecord.parsed.includeTree.map((node, idx) => (
                      <li key={`${node.domain}-${idx}`}>
                        <code>{`${'↳ '.repeat(Math.max(0, (node.depth || 1) - 1))}${node.domain}`}</code>
                        <span>
                          {node.error
                            ? node.error
                            : `${node.record || 'No SPF'} (${node.lookups || 0} DNS lookup${node.lookups === 1 ? '' : 's'})`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}
          {dmarcRecord?.parsed && dmarcRecord.parsed.tags?.length > 0 ? (
            <section className="sender-detail-card" data-testid="sender-dmarc-details">
              <h3>DMARC Tag Breakdown</h3>
              <ul className="sender-breakdown-list">
                {dmarcRecord.parsed.tags.map((item, idx) => (
                  <li key={`${item.tag}-${idx}`}>
                    <code>{item.tag}={item.value}</code>
                    <strong>{item.label}</strong>
                    <span>{item.explanation}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {dkimReport ? (
            <section className="sender-detail-card" data-testid="sender-dkim-details">
              <h3>DKIM Key Inspector</h3>
              <p className="sender-detail-meta">
                <strong>Discovery mode:</strong>{' '}
                {dkimReport.mode === 'explicit'
                  ? `Explicit selector (${dkimReport.probedSelectors?.[0] || ''})`
                  : `Auto-probed common selectors (${(dkimReport.probedSelectors || []).join(', ')})`}
              </p>
              {dkimReport.selectors?.length > 0 ? (
                <ul className="sender-breakdown-list">
                  {dkimReport.selectors.map((sel) => (
                    <li key={sel.selector}>
                      <code>{sel.fqdn || `${sel.selector}._domainkey.${report.domain}`}</code>
                      <strong>
                        {sel.keyType ? sel.keyType.toUpperCase() : 'DKIM'}
                        {sel.keyBits ? ` ${sel.keyBits}-bit` : ''}
                        {' '}
                        ({sel.status})
                      </strong>
                      <span>{sel.detail}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="sender-detail-meta">
                  No active DKIM keys found among common selectors. Enter your custom DKIM selector above to inspect it.
                </p>
              )}
            </section>
          ) : null}
          {transportAndBrand && (transportAndBrand.bimi || transportAndBrand.mtaSts || transportAndBrand.tlsRpt) ? (
            <section className="sender-detail-card" data-testid="sender-transport-brand">
              <h3>Transport Security &amp; Brand (BIMI / MTA-STS / TLS-RPT)</h3>
              <ul className="sender-breakdown-list">
                {[transportAndBrand.bimi, transportAndBrand.mtaSts, transportAndBrand.tlsRpt]
                  .filter(Boolean)
                  .map((item) => (
                    <li key={item.id || item.name}>
                      <code>{item.name}</code>
                      <strong>{item.status}</strong>
                      <span>{item.detail}</span>
                    </li>
                  ))}
              </ul>
            </section>
          ) : null}
          {Array.isArray(report.recommendations) && report.recommendations.length > 0 ? (
            <section className="sender-detail-card" data-testid="sender-recommendations">
              <h3>Actionable DNS Recommendations</h3>
              <ul className="sender-recommendations-list">
                {report.recommendations.map((rec) => (
                  <li key={rec.id} className={`sender-rec sender-rec-${rec.severity}`}>
                    <div className="sender-rec-head">
                      <strong>{rec.title}</strong>
                      <span className="sender-rec-badge">{rec.severity}</span>
                    </div>
                    <p>{rec.detail}</p>
                    {rec.suggestedRecord ? (
                      <code className="sender-rec-code">{rec.suggestedRecord}</code>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </section>
      ) : null}
      <SenderOffer />
    </main>
  );
};

export default Sender;
