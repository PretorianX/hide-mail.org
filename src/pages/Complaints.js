import React, { useEffect, useState } from 'react';
import ComplaintService from '../services/ComplaintService';
import ComplaintOffer from './ComplaintOffer';
import './Complaints.css';

/**
 * UI plan for Complaint Read, in the existing Hide Mail look.
 * Entry: header link Complaints, same plain nav treatment as Home, Blog, About, and Contact.
 * Empty: the suppression slip shows an em dash, the field is blank, and the line under the
 * button says the paste is not stored.
 * Primary action: Read this complaint.
 * Result: the slip stamps the feedback type and the address to act on.
 * Error: a red alert replaces that line. The stamp returns to an em dash and the previous slip is gone.
 * Memorable element: the suppression slip.
 */

const SAMPLE_COMPLAINT = [
  'Feedback-Type: abuse',
  'User-Agent: Yahoo!-Mail-Feedback/2.0',
  'Version: 1',
  'Original-Mail-From: <newsletter@sender.example>',
  'Original-Rcpt-To: <subscriber@example.net>',
  'Original-Envelope-Id: env-arf-20261026-01',
  'Arrival-Date: Wed, 26 Oct 2026 11:30:00 +0000',
  'Source-IP: 192.0.2.44',
  'Reported-Domain: sender.example',
  'Reported-Uri: https://sender.example/promo/october',
  'Authentication-Results: mta.example.net; dkim=pass header.d=sender.example; spf=pass smtp.mailfrom=sender.example',
  'Incidents: 1',
].join('\n');

const Complaints = () => {
  const [source, setSource] = useState('');
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copiedMode, setCopiedMode] = useState(null);

  useEffect(() => {
    if (!error && !report) {
      return undefined;
    }
    const target = document.querySelector(error ? '[role="alert"]' : '[data-testid="complaint-result"]');
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
      setError('Paste a feedback report first.');
      return;
    }
    setBusy(true);
    try {
      const next = await ComplaintService.read(source);
      setReport(next);
    } catch (err) {
      setReport(null);
      setError(err.message || 'Complaint Read could not read that report.');
    } finally {
      setBusy(false);
    }
  };

  const onLoadSample = () => {
    setSource(SAMPLE_COMPLAINT);
    setError(null);
  };

  const readFileText = async (file) => {
    if (!file) return;
    try {
      const text = typeof file.text === 'function'
        ? await file.text()
        : await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('Could not read that file.'));
          reader.readAsText(file);
        });
      setSource(text);
      setError(null);
    } catch (err) {
      setError(err.message || 'Could not read that file.');
    }
  };

  const onFileChange = async (event) => {
    const file = event.target.files && event.target.files[0];
    await readFileText(file);
  };

  const onDrop = async (event) => {
    event.preventDefault();
    const file = event.dataTransfer?.files && event.dataTransfer.files[0];
    await readFileText(file);
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
    const payload = JSON.stringify({ raw: source.trim() || SAMPLE_COMPLAINT });
    const snippet = `curl -X POST https://hide-mail.org/api/complaint-read \\\n  -H "X-API-Key: hm_live_..." \\\n  -H "Content-Type: application/json" \\\n  -d '${payload.replace(/'/g, "'\\''")}'`;
    copyText(snippet, 'curl');
  };

  const onExportCsv = () => {
    if (!report) return;
    const rec = report.suppressionRecord || {
      email: report.recipient,
      action: report.action,
      reason: `arf_${report.feedbackType}`,
      domain: report.reportedDomain,
      sourceIp: report.sourceIp,
      messageId: report.originalMessage?.messageId || null,
      arrivalDate: report.arrivalDate || report.receivedDate || null,
    };
    const escapeCsv = (val) => {
      const str = val == null ? '' : String(val);
      return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const headers = ['email', 'action', 'reason', 'domain', 'source_ip', 'message_id', 'arrival_date'];
    const row = [
      rec.email,
      rec.action,
      rec.reason,
      rec.domain,
      rec.sourceIp,
      rec.messageId,
      rec.arrivalDate,
    ].map(escapeCsv);
    const csv = `${headers.join(',')}\n${row.join(',')}\n`;
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'suppression-export.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      if (typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(url);
      }
    }
    copyText(csv, 'csv');
  };

  const facts = report ? [
    ['Feedback type', report.feedbackType],
    ['Source IP', report.sourceIp],
    ['Reported domain', report.reportedDomain],
    ['Reported URI', Array.isArray(report.reportedUri) && report.reportedUri.length ? report.reportedUri.join(', ') : report.reportedUri],
    ['Mail from', report.mailFrom],
    ['DKIM domain', report.dkimDomain],
    ['Authentication-Results', Array.isArray(report.authenticationResults) && report.authenticationResults.length ? report.authenticationResults.join('; ') : report.authenticationResults],
    ['Incidents', report.incidents ? String(report.incidents) : null],
    ['ARF version', report.version],
    ['Envelope ID', Array.isArray(report.originalEnvelopeId) && report.originalEnvelopeId.length ? report.originalEnvelopeId.join(', ') : report.originalEnvelopeId],
    ['Message-ID', report.originalMessage?.messageId || null],
    ['Subject', report.originalMessage?.subject || null],
    ['List-Unsubscribe', report.originalMessage ? (report.originalMessage.listUnsubscribe ? 'Yes' : 'No') : null],
    ['Received', report.receivedDate],
    ['Arrived', report.arrivalDate],
    ['User agent', report.userAgent],
  ].filter(([, value]) => value) : [];

  return (
    <main className="complaint-page">
      <h1>Complaint Read</h1>
      <p className="complaint-lead">
        Paste an abuse feedback report. Complaint Read names the address to act on
        and the reason the receiver complained.
      </p>
      <form className="complaint-form" onSubmit={onSubmit}>
        <div className="complaint-slip" data-testid="complaint-slip">
          <div
            className={`complaint-stamp${report ? '' : ' complaint-stamp-empty'}`}
            data-testid="complaint-stamp"
            data-action={report ? report.action : 'empty'}
            aria-hidden="true"
          >
            <span>{report ? report.stamp : '—'}</span>
          </div>
          <div className="complaint-slip-copy">
            {report ? (
              <>
                <p className="complaint-address" data-testid="complaint-address">{report.recipient}</p>
                <p className="complaint-action">{report.actionLabel}</p>
              </>
            ) : (
              <p className="complaint-slip-waiting">The address to act on shows up here.</p>
            )}
          </div>
        </div>
        <label htmlFor="complaint-source">Feedback report</label>
        <textarea
          id="complaint-source"
          value={source}
          onChange={(event) => setSource(event.target.value)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={onDrop}
          spellCheck="false"
          placeholder={'Feedback-Type: abuse\nOriginal-Rcpt-To: <subscriber@example.net>\nSource-IP: 192.0.2.1'}
        />
        <div className="complaint-actions">
          <button type="submit" className="complaint-submit" disabled={busy}>
            {busy ? 'Reading…' : 'Read this complaint'}
          </button>
          <button
            type="button"
            className="complaint-sample-btn"
            onClick={onLoadSample}
            disabled={busy}
          >
            Load sample
          </button>
          <label className="complaint-sample-btn complaint-file-label">
            Upload .eml / .arf
            <input
              type="file"
              accept=".eml,.arf,.txt,message/rfc822"
              onChange={onFileChange}
              data-testid="complaints-file-input"
              hidden
            />
          </label>
        </div>
        {error ? (
          <p className="complaint-error" role="alert" data-testid="complaint-error">{error}</p>
        ) : null}
        {!report && !error ? (
          <p className="complaint-empty" data-testid="complaint-empty">
            Waiting for a feedback report. Nothing you paste is stored.
          </p>
        ) : null}
      </form>
      {report ? (
        <section className="complaint-result" aria-live="polite" data-testid="complaint-result">
          <div className="complaint-result-header">
            <h2>{report.stamp}</h2>
            <div className="complaint-export-bar">
              <button
                type="button"
                className="complaint-export-btn"
                onClick={onExportCsv}
                data-testid="complaint-export-csv"
              >
                {copiedMode === 'csv' ? 'Exported CSV' : 'Export Suppression CSV'}
              </button>
              <button
                type="button"
                className="complaint-export-btn"
                onClick={onCopyJson}
                data-testid="complaint-copy-json"
              >
                {copiedMode === 'json' ? 'Copied JSON' : 'Copy JSON'}
              </button>
              <button
                type="button"
                className="complaint-export-btn"
                onClick={onCopyCurl}
                data-testid="complaint-copy-curl"
              >
                {copiedMode === 'curl' ? 'Copied curl' : 'Copy curl'}
              </button>
            </div>
          </div>
          {report.feedbackExplanation ? (
            <p className="complaint-explanation">{report.feedbackExplanation}</p>
          ) : null}
          <dl>
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {Array.isArray(report.workflow) && report.workflow.length > 0 ? (
            <section className="complaint-workflow-card" data-testid="complaint-workflow">
              <h3>Recommended Suppression &amp; Compliance Workflow</h3>
              <ol className="complaint-workflow-list">
                {report.workflow.map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ol>
            </section>
          ) : null}
        </section>
      ) : null}
      <ComplaintOffer />
    </main>
  );
};

export default Complaints;
