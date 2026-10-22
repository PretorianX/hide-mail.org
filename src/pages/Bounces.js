import React, { useEffect, useState } from 'react';
import BounceService from '../services/BounceService';
import BounceOffer from './BounceOffer';
import './Bounces.css';

const STAMP_LABEL = {
  hard: 'HARD',
  soft: 'SOFT',
  delayed: 'DELAY',
  delivered: 'SENT',
  relayed: 'RELAY',
  expanded: 'EXPAND',
  mixed: 'MIXED',
};

const retryLine = (recipient) => (
  recipient.retry ? 'You can retry this address.' : 'Do not retry this address.'
);

const Bounces = () => {
  const [source, setSource] = useState('');
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!error && !report) {
      return undefined;
    }
    const target = document.querySelector(error ? '[role="alert"]' : '[data-testid="bounce-result"]');
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
      setError('Paste a bounce first.');
      return;
    }
    setBusy(true);
    try {
      const next = await BounceService.read(source);
      setReport(next);
    } catch (err) {
      setReport(null);
      setError(err.message || 'Bounce Read could not read that bounce.');
    } finally {
      setBusy(false);
    }
  };

  const stamp = report ? (STAMP_LABEL[report.verdict] || 'MIXED') : null;

  return (
    <main className="bounce-page">
      <h1>Bounce Read</h1>
      <p className="bounce-lead">
        Paste a delivery failure and see whether that address is worth another try.
        The bounce is read in memory and is not stored.
      </p>
      <div className="bounce-work">
        <div
          className={`bounce-stamp${stamp ? ` bounce-stamp-${report.verdict}` : ' bounce-stamp-empty'}`}
          data-testid="bounce-stamp"
          aria-hidden="true"
        >
          <span>{stamp || '—'}</span>
        </div>
        <form className="bounce-form" onSubmit={onSubmit}>
          <label htmlFor="bounce-source">Raw bounce</label>
          <textarea
            id="bounce-source"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            spellCheck="false"
            placeholder={'Final-Recipient: rfc822; ada@example.com\nAction: failed\nStatus: 5.1.1'}
          />
          <button type="submit" className="bounce-submit" disabled={busy}>
            {busy ? 'Reading…' : 'Read this bounce'}
          </button>
          {error ? <p className="bounce-error" role="alert">{error}</p> : null}
          {!report && !error ? (
            <p className="bounce-empty" data-testid="bounce-empty">
              Waiting for a bounce. Nothing you paste is stored.
            </p>
          ) : null}
        </form>
      </div>
      {report ? (
        <section className="bounce-result" aria-live="polite" data-testid="bounce-result">
          <h2>{report.summary}</h2>
          {report.reportingMta ? (
            <p className="bounce-mta">Reporting server {report.reportingMta}</p>
          ) : null}
          <ul className="bounce-recipients">
            {report.recipients.map((recipient, index) => (
              <li key={`${recipient.recipient}-${recipient.status}-${index}`} className={`bounce-recipient bounce-recipient-${recipient.class}`}>
                <strong>{recipient.recipient}</strong>
                <span className="bounce-recipient-title">{recipient.title}</span>
                <span>Status {recipient.status}{recipient.action ? ` · ${recipient.action}` : ''}</span>
                <span>{retryLine(recipient)}</span>
                {recipient.diagnostic ? <span className="bounce-diagnostic">{recipient.diagnostic}</span> : null}
                {recipient.remoteMta ? <span>Remote server {recipient.remoteMta}</span> : null}
                <span>{recipient.detail}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <BounceOffer />
    </main>
  );
};

export default Bounces;
