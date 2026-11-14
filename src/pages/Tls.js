import React, { useEffect, useState } from 'react';
import TlsService from '../services/TlsService';
import TlsOffer from './TlsOffer';
import './Tls.css';

/**
 * UI plan for TLS Reports, in the existing Hide Mail look.
 * Entry: header link TLS, same plain nav treatment as Home, Blog, About, and Contact.
 * Empty: the failure stamp shows an em dash, the field is blank, and the line under the
 * button says the paste is not stored.
 * Primary action: Read this report.
 * Result: the stamp reads FAILURES, CLEAR, or EMPTY, and the hosts sit under it.
 * Error: a red alert replaces that line. The stamp returns to an em dash and the previous result is gone.
 * Memorable element: the failure stamp.
 */

const SAMPLE_REPORT = JSON.stringify({
  'organization-name': 'Northwind Post',
  'date-range': {
    'start-datetime': '2026-11-01T00:00:00Z',
    'end-datetime': '2026-11-01T23:59:59Z',
  },
  'contact-info': 'tls-reports@northwind.example',
  'report-id': 'nov-01-northwind',
  policies: [
    {
      policy: {
        'policy-type': 'sts',
        'policy-string': ['version: STSv1', 'mode: enforce'],
        'policy-domain': 'northwind.example',
        'mx-host': ['*.northwind.example'],
      },
      summary: {
        'total-successful-session-count': 840,
        'total-failure-session-count': 26,
      },
      'failure-details': [
        {
          'result-type': 'certificate-expired',
          'sending-mta-ip': '203.0.113.8',
          'receiving-mx-hostname': 'mx1.northwind.example',
          'receiving-ip': '203.0.113.20',
          'failed-session-count': 26,
        },
      ],
    },
  ],
}, null, 2);

const Tls = () => {
  const [source, setSource] = useState('');
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!error && !report) {
      return undefined;
    }
    const target = document.querySelector(error ? '[role="alert"]' : '[data-testid="tls-result"]');
    if (typeof target?.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    return undefined;
  }, [error, report]);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    if (!source.trim()) {
      setReport(null);
      setError('Paste an SMTP TLS report first.');
      return;
    }
    setBusy(true);
    try {
      const next = await TlsService.read(source);
      setReport(next);
    } catch (err) {
      setReport(null);
      setError(err.message || 'TLS Reports could not read that report.');
    } finally {
      setBusy(false);
    }
  };

  const onLoadSample = () => {
    setSource(SAMPLE_REPORT);
    setError(null);
  };

  return (
    <main className="tls-page">
      <h1>TLS Reports</h1>
      <p className="tls-lead">
        Paste an SMTP TLS report and see which hosts failed the handshake, and why.
      </p>
      <form className="tls-form" onSubmit={onSubmit}>
        <div className="tls-slip" data-testid="tls-slip">
          <div
            className={`tls-stamp${report ? '' : ' tls-stamp-empty'}`}
            data-testid="tls-stamp"
            data-stamp={report ? report.verdict : 'waiting'}
          >
            {report ? report.stamp : '—'}
          </div>
          <div className="tls-slip-copy">
            {report ? (
              <p className="tls-summary" data-testid="tls-summary">{report.summary}</p>
            ) : (
              <p className="tls-slip-waiting">The failure stamp shows up here.</p>
            )}
          </div>
        </div>
        <label htmlFor="tls-source">SMTP TLS report</label>
        <textarea
          id="tls-source"
          value={source}
          onChange={(event) => setSource(event.target.value)}
          spellCheck="false"
          placeholder="Paste the JSON report here"
        />
        <div className="tls-actions">
          <button type="submit" className="tls-submit" disabled={busy}>
            {busy ? 'Reading…' : 'Read this report'}
          </button>
          <button type="button" className="tls-sample-btn" onClick={onLoadSample}>
            Load a sample
          </button>
        </div>
        {error ? (
          <p className="tls-error" role="alert" data-testid="tls-error">{error}</p>
        ) : null}
        {!error && !report ? (
          <p className="tls-empty" data-testid="tls-empty">
            Nothing you paste is stored.
          </p>
        ) : null}
      </form>
      {report ? (
        <section className="tls-result" aria-live="polite" data-testid="tls-result">
          <h2>Hosts</h2>
          {report.policies.map((policy) => (
            <article key={`${policy.domain}-${policy.policyType}`} className="tls-policy">
              <h3>
                {policy.domain}
                <span>{policy.policyLabel}{policy.mode ? ` · ${policy.mode}` : ''}</span>
              </h3>
              <p>
                {policy.successfulSessions} succeeded, {policy.failedSessions} failed.
              </p>
              {policy.failures.length === 0 ? (
                <p>No failed hosts listed.</p>
              ) : (
                <ul>
                  {policy.failures.map((failure) => (
                    <li key={`${failure.receivingHost}-${failure.resultType}-${failure.sendingIp}`}>
                      <strong>{failure.receivingHost}</strong>
                      {' — '}
                      {failure.reason}
                      {' '}
                      <span>{failure.failedSessions} sessions from {failure.sendingIp}</span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </section>
      ) : null}
      <TlsOffer />
    </main>
  );
};

export default Tls;
