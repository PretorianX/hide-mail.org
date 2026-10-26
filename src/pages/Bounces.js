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

const SAMPLE_BOUNCE = [
  'Reporting-MTA: dns; mx-out.sender.example',
  'Received-From-MTA: dns; app-01.sender.example',
  'Arrival-Date: Wed, 26 Oct 2026 11:42:10 +0000',
  'Original-Envelope-Id: env-20261026-9941',
  '',
  'Original-Recipient: rfc822; old-alias@example.com',
  'Final-Recipient: rfc822; ada@example.com',
  'Action: failed',
  'Status: 5.1.1',
  'Remote-MTA: dns; mx.example.com',
  'Diagnostic-Code: smtp; 550 5.1.1 <ada@example.com>: Recipient address rejected: User unknown in virtual mailbox table',
  'Last-Attempt-Date: Wed, 26 Oct 2026 11:42:12 +0000',
].join('\n');

const Bounces = () => {
  const [source, setSource] = useState('');
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copiedMode, setCopiedMode] = useState(null);

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

  const onLoadSample = () => {
    setSource(SAMPLE_BOUNCE);
    setError(null);
  };

  const readUploadedFile = async (file) => {
    if (!file) {
      return;
    }
    setError(null);
    try {
      const text = typeof file.text === 'function'
        ? await file.text()
        : await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('Could not read file.'));
          reader.readAsText(file);
        });
      setSource(text);
    } catch (err) {
      setError(err.message || 'Could not read that file.');
    }
  };

  const onFileChange = (event) => {
    const file = event.target.files && event.target.files[0];
    readUploadedFile(file);
  };

  const onDrop = (event) => {
    event.preventDefault();
    const file = event.dataTransfer?.files && event.dataTransfer.files[0];
    readUploadedFile(file);
  };

  const onDragOver = (event) => {
    event.preventDefault();
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
    const payload = JSON.stringify({ raw: source.trim() || SAMPLE_BOUNCE });
    const snippet = `curl -X POST https://hide-mail.org/api/bounce-read \\\n  -H "X-API-Key: hm_live_..." \\\n  -H "Content-Type: application/json" \\\n  -d '${payload.replace(/'/g, "'\\''")}'`;
    copyText(snippet, 'curl');
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
        <form className="bounce-form" onSubmit={onSubmit} onDrop={onDrop} onDragOver={onDragOver}>
          <label htmlFor="bounce-source">Raw bounce</label>
          <textarea
            id="bounce-source"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            spellCheck="false"
            placeholder={'Final-Recipient: rfc822; ada@example.com\nAction: failed\nStatus: 5.1.1'}
          />
          <div className="bounce-file-bar">
            <label htmlFor="bounce-file-input" className="bounce-file-label">
              Drop or upload a .eml / .dsn bounce file
            </label>
            <input
              id="bounce-file-input"
              type="file"
              accept=".eml,.dsn,.txt,message/rfc822"
              data-testid="bounces-file-input"
              onChange={onFileChange}
              disabled={busy}
            />
          </div>
          <div className="bounce-actions">
            <button type="submit" className="bounce-submit" disabled={busy}>
              {busy ? 'Reading…' : 'Read this bounce'}
            </button>
            <button
              type="button"
              className="bounce-sample-btn"
              onClick={onLoadSample}
              disabled={busy}
            >
              Load sample
            </button>
          </div>
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
          <div className="bounce-result-header">
            <h2>{report.summary}</h2>
            <div className="bounce-export-bar">
              <button
                type="button"
                className="bounce-export-btn"
                onClick={onCopyJson}
                data-testid="bounce-copy-json"
              >
                {copiedMode === 'json' ? 'Copied JSON' : 'Copy JSON'}
              </button>
              <button
                type="button"
                className="bounce-export-btn"
                onClick={onCopyCurl}
                data-testid="bounce-copy-curl"
              >
                {copiedMode === 'curl' ? 'Copied curl' : 'Copy curl'}
              </button>
            </div>
          </div>
          {report.reportingMta ? (
            <p className="bounce-mta">Reporting server {report.reportingMta}</p>
          ) : null}
          {report.receivedFromMta || report.arrivalDate || report.originalEnvelopeId || report.counts ? (
            <dl className="bounce-meta-grid" data-testid="bounce-dsn-meta">
              {report.receivedFromMta ? (
                <div>
                  <dt>Received from MTA</dt>
                  <dd>{report.receivedFromMta}</dd>
                </div>
              ) : null}
              {report.arrivalDate ? (
                <div>
                  <dt>Arrival date</dt>
                  <dd>{report.arrivalDate}</dd>
                </div>
              ) : null}
              {report.originalEnvelopeId ? (
                <div>
                  <dt>Envelope ID</dt>
                  <dd>{report.originalEnvelopeId}</dd>
                </div>
              ) : null}
              {report.counts ? (
                <div>
                  <dt>Recipient breakdown</dt>
                  <dd>
                    {report.counts.total} total ({report.counts.hard} hard, {report.counts.soft} soft)
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}
          {report.originalMessage ? (
            <dl className="bounce-meta-grid" data-testid="bounce-original-message">
              {report.originalMessage.subject ? (
                <div>
                  <dt>Original Subject</dt>
                  <dd>{report.originalMessage.subject}</dd>
                </div>
              ) : null}
              {report.originalMessage.messageId ? (
                <div>
                  <dt>Original Message-ID</dt>
                  <dd>{report.originalMessage.messageId}</dd>
                </div>
              ) : null}
              {report.originalMessage.from ? (
                <div>
                  <dt>Original From</dt>
                  <dd>{report.originalMessage.from}</dd>
                </div>
              ) : null}
              {report.originalMessage.date ? (
                <div>
                  <dt>Original Date</dt>
                  <dd>{report.originalMessage.date}</dd>
                </div>
              ) : null}
              {report.originalMessage.listUnsubscribe ? (
                <div>
                  <dt>List-Unsubscribe</dt>
                  <dd>{report.originalMessage.listUnsubscribe}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
          <ul className="bounce-recipients">
            {report.recipients.map((recipient, index) => (
              <li key={`${recipient.recipient}-${recipient.status}-${index}`} className={`bounce-recipient bounce-recipient-${recipient.class}`}>
                <strong>{recipient.recipient}</strong>
                <span className="bounce-recipient-title">{recipient.title}</span>
                {recipient.category ? (
                  <span className="bounce-recipient-badge">{recipient.category}</span>
                ) : null}
                {recipient.reasonCode ? (
                  <span className="bounce-recipient-badge" data-testid={`bounce-reason-${index}`}>
                    {recipient.reasonCode}
                  </span>
                ) : null}
                {recipient.ispHint ? (
                  <span className="bounce-recipient-badge" data-testid={`bounce-isp-${index}`}>
                    {recipient.ispHint}
                  </span>
                ) : null}
                <span>
                  Status {recipient.status}
                  {recipient.smtpCode ? ` (SMTP ${recipient.smtpCode})` : ''}
                  {recipient.action ? ` · ${recipient.action}` : ''}
                </span>
                <span>{retryLine(recipient)}</span>
                {recipient.originalRecipient && recipient.originalRecipient !== recipient.recipient ? (
                  <span>Original recipient: {recipient.originalRecipient}</span>
                ) : null}
                {recipient.diagnostic ? <span className="bounce-diagnostic">{recipient.diagnostic}</span> : null}
                {recipient.remoteMta ? <span>Remote server {recipient.remoteMta}</span> : null}
                {recipient.lastAttemptDate ? <span>Last attempt: {recipient.lastAttemptDate}</span> : null}
                {recipient.willRetryUntil ? <span>Will retry until: {recipient.willRetryUntil}</span> : null}
                <span>{recipient.detail}</span>
                {recipient.remediation ? (
                  <div className="bounce-remediation" data-testid={`bounce-remediation-${index}`}>
                    <strong>Remediation:</strong> {recipient.remediation}
                  </div>
                ) : null}
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
