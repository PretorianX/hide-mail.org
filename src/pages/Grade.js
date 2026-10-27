import React, { useEffect, useState } from 'react';
import { Link } from 'react-router';
import GradeService from '../services/GradeService';
import GradeOffer from './GradeOffer';
import GradeReceive from '../components/GradeReceive';
import { guidePathFor } from '../data/mailGradeGuide';
import './Grade.css';

const FINDING_GROUPS = [
  { severity: 'fail', title: 'Problems' },
  { severity: 'warn', title: 'Warnings' },
  { severity: 'pass', title: 'Looks good' },
];

const SAMPLE_EMAIL = [
  'Received: from mail.example.com (mail.example.com [93.184.216.34])',
  '  by mx.hide-mail.org with ESMTPS id abc123;',
  '  Wed, 26 Oct 2026 12:00:00 +0000',
  'From: "Hide Mail Billing" <billing@example.com>',
  'To: customer@example.org',
  'Reply-To: support@example.com',
  'Return-Path: <bounces@example.com>',
  'Subject: Your October invoice and deliverability summary',
  'Date: Wed, 26 Oct 2026 12:00:00 +0000',
  'Message-ID: <20261026120000.invoice-9812@example.com>',
  'MIME-Version: 1.0',
  'List-Unsubscribe: <mailto:unsubscribe@example.com>, <https://example.com/unsubscribe?id=9812>',
  'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
  'Content-Type: multipart/alternative; boundary="hm-boundary-42"',
  '',
  '--hm-boundary-42',
  'Content-Type: text/plain; charset="UTF-8"',
  '',
  'Hello,',
  'Your October invoice is ready at https://example.com/billing/invoices/9812.',
  '',
  '--hm-boundary-42',
  'Content-Type: text/html; charset="UTF-8"',
  '',
  '<html><body><p>Hello,</p><p>Your October invoice is ready at <a href="https://example.com/billing/invoices/9812">View Invoice</a>.</p><img src="https://example.com/logo.png" alt="Example Logo" /></body></html>',
  '',
  '--hm-boundary-42--',
].join('\n');

const MAX_UPLOAD_BYTES = 64 * 1024;

const readFileAsText = (file) => new Promise((resolve, reject) => {
  if (typeof file.text === 'function') {
    file.text().then(resolve).catch(reject);
    return;
  }
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('Could not read that file.'));
  reader.readAsText(file);
});

const Grade = () => {
  const [source, setSource] = useState('');
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copiedMode, setCopiedMode] = useState(null);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    if (!error && !report) {
      return undefined;
    }
    const target = document.querySelector(error ? '[role="alert"]' : '[data-testid="grade-result"]');
    if (typeof target?.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    return undefined;
  }, [error, report]);

  const runGrade = async (rawSource) => {
    setError(null);
    if (!String(rawSource || '').trim()) {
      setReport(null);
      setError('Paste a raw email first.');
      return;
    }
    setBusy(true);
    try {
      const next = await GradeService.grade(rawSource);
      setReport(next);
    } catch (err) {
      setReport(null);
      setError(err.message || 'Mail Grade could not read that email.');
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    await runGrade(source);
  };

  const onReceiveSource = async (raw) => {
    setSource(raw);
    await runGrade(raw);
  };

  const onLoadSample = () => {
    setSource(SAMPLE_EMAIL);
    setError(null);
  };

  const handleFileUpload = async (file) => {
    if (!file) return;
    setError(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('That file exceeds the 64 KB limit.');
      return;
    }
    try {
      const text = await readFileAsText(file);
      setSource(text);
    } catch (err) {
      setError(err.message || 'Could not read that file.');
    }
  };

  const onFileChange = (event) => {
    const file = event.target.files && event.target.files[0];
    handleFileUpload(file);
  };

  const onDragOver = (event) => {
    event.preventDefault();
    setDragActive(true);
  };

  const onDragLeave = (event) => {
    event.preventDefault();
    setDragActive(false);
  };

  const onDrop = (event) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    handleFileUpload(file);
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
    const payload = JSON.stringify({ source: source || 'From: Ada <ada@example.com>\nSubject: Hello\n\nHi' });
    const snippet = `curl -X POST https://hide-mail.org/api/mail-grade \\\n  -H "X-API-Key: hm_live_..." \\\n  -H "Content-Type: application/json" \\\n  -d '${payload.replace(/'/g, "'\\''")}'`;
    copyText(snippet, 'curl');
  };

  const letter = report && /^[A-F]$/.test(report.grade) ? report.grade : null;
  const findingGroups = report
    ? FINDING_GROUPS.map((group) => ({
      ...group,
      findings: report.findings.filter((finding) => finding.severity === group.severity),
    })).filter((group) => group.findings.length > 0)
    : [];

  return (
    <main className="grade-page">
      <h1>Mail Grade</h1>
      <p className="grade-lead">
        Paste a raw email, or send one to a temporary Hide Mail address.
        Mail Grade returns a quality report before you send it for real.
        {' '}
        <Link to="/grade/guide" className="grade-guide-link">Findings guide</Link>
      </p>
      <div className="grade-work">
        <div
          className={`grade-stamp${letter ? ` grade-stamp-${letter}` : ' grade-stamp-empty'}`}
          data-testid="grade-stamp"
          aria-hidden="true"
        >
          <span>{letter || '—'}</span>
        </div>
        <form
          className={`grade-form${dragActive ? ' grade-form-drag' : ''}`}
          onSubmit={onSubmit}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          data-testid="grade-dropzone"
        >
          <label htmlFor="grade-source">Raw email</label>
          <textarea
            id="grade-source"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            spellCheck="false"
            placeholder={'From: Ada <ada@example.com>\nSubject: Hello\n\nThe message body.'}
          />
          <div className="grade-actions">
            <button type="submit" className="grade-submit" disabled={busy}>
              {busy ? 'Grading…' : 'Grade this email'}
            </button>
            <button
              type="button"
              className="grade-sample-btn"
              onClick={onLoadSample}
              disabled={busy}
            >
              Load sample
            </button>
            <label className="grade-upload-label">
              Upload .eml
              <input
                type="file"
                accept=".eml,.txt,message/rfc822"
                onChange={onFileChange}
                data-testid="grade-file-input"
                className="grade-file-input"
              />
            </label>
          </div>
          {error ? <p className="grade-error" role="alert">{error}</p> : null}
          {!report && !error ? (
            <p className="grade-empty" data-testid="grade-empty">
              Waiting for an email. Nothing you paste is stored.
            </p>
          ) : null}
        </form>
      </div>
      <GradeReceive onSourceReady={onReceiveSource} />
      {report ? (
        <section className="grade-result" aria-live="polite" data-testid="grade-result">
          <div className="grade-result-header">
            <h2>
              Grade {report.grade}
              <span className="grade-score"> score {report.score}</span>
            </h2>
            <div className="grade-export-bar">
              <button
                type="button"
                className="grade-export-btn"
                onClick={onCopyJson}
                data-testid="grade-copy-json"
              >
                {copiedMode === 'json' ? 'Copied JSON' : 'Copy JSON'}
              </button>
              <button
                type="button"
                className="grade-export-btn"
                onClick={onCopyCurl}
                data-testid="grade-copy-curl"
              >
                {copiedMode === 'curl' ? 'Copied curl' : 'Copy curl'}
              </button>
            </div>
          </div>
          <p>{report.summary}</p>
          {report.envelope ? (
            <section className="grade-detail-card" data-testid="grade-envelope">
              <h3>Envelope &amp; Header Inspection</h3>
              <dl className="grade-meta-grid">
                <div>
                  <dt>From</dt>
                  <dd>{report.envelope.from || '—'}</dd>
                </div>
                <div>
                  <dt>From domain</dt>
                  <dd>{report.envelope.fromDomain || '—'}</dd>
                </div>
                <div>
                  <dt>Return-Path</dt>
                  <dd>{report.envelope.returnPath || '—'}</dd>
                </div>
                <div>
                  <dt>Reply-To</dt>
                  <dd>{report.envelope.replyTo || '—'}</dd>
                </div>
                <div>
                  <dt>Subject</dt>
                  <dd>
                    {report.envelope.subject || '—'}
                    {typeof report.envelope.subjectLength === 'number'
                      ? ` (${report.envelope.subjectLength} chars)`
                      : ''}
                  </dd>
                </div>
                <div>
                  <dt>Message-ID</dt>
                  <dd>{report.envelope.messageId || '—'}</dd>
                </div>
                <div>
                  <dt>Content-Type</dt>
                  <dd>{report.envelope.contentType || '—'}</dd>
                </div>
                <div>
                  <dt>Message size</dt>
                  <dd>{report.envelope.sizeBytes} bytes</dd>
                </div>
                <div>
                  <dt>Sending IP</dt>
                  <dd>
                    {report.envelope.sendingIp || 'None detected'}
                    {typeof report.envelope.receivedHops === 'number'
                      ? ` (${report.envelope.receivedHops} hop${report.envelope.receivedHops === 1 ? '' : 's'})`
                      : ''}
                  </dd>
                </div>
              </dl>
            </section>
          ) : null}
          {report.authentication ? (
            <section className="grade-detail-card" data-testid="grade-auth-matrix">
              <h3>Authentication &amp; Alignment Matrix</h3>
              <ul className="grade-auth-list">
                {report.authentication.spf ? (
                  <li className="grade-auth-item">
                    <strong>SPF</strong>
                    <span className={`grade-pill grade-pill-${report.authentication.spf.status}`}>
                      {report.authentication.spf.status}
                    </span>
                    <span>
                      Domain: {report.authentication.spf.domain || '—'}
                      {' · '}
                      IP: {report.authentication.spf.ip || 'none'}
                    </span>
                  </li>
                ) : null}
                {report.authentication.dkim ? (
                  <li className="grade-auth-item">
                    <strong>DKIM</strong>
                    <span className={`grade-pill grade-pill-${report.authentication.dkim.status}`}>
                      {report.authentication.dkim.status}
                    </span>
                    <span>
                      d={report.authentication.dkim.signingDomain || '—'}
                      {report.authentication.dkim.selector ? ` · s=${report.authentication.dkim.selector}` : ''}
                      {' · '}
                      {report.authentication.dkim.aligned ? 'Aligned with From' : 'Not aligned with From'}
                    </span>
                  </li>
                ) : null}
                {report.authentication.dmarc ? (
                  <li className="grade-auth-item">
                    <strong>DMARC</strong>
                    <span className={`grade-pill grade-pill-${report.authentication.dmarc.status}`}>
                      {report.authentication.dmarc.status}
                    </span>
                    <span>
                      Policy: p={report.authentication.dmarc.policy || 'none'}
                      {' · '}
                      Domain: {report.authentication.dmarc.domain || '—'}
                    </span>
                  </li>
                ) : null}
                {report.authentication.listUnsubscribe ? (
                  <li className="grade-auth-item">
                    <strong>List-Unsubscribe</strong>
                    <span className={`grade-pill ${report.authentication.listUnsubscribe.present ? 'grade-pill-pass' : 'grade-pill-none'}`}>
                      {report.authentication.listUnsubscribe.present ? 'present' : 'missing'}
                    </span>
                    <span>
                      {report.authentication.listUnsubscribe.oneClick
                        ? 'RFC 8058 One-Click enabled'
                        : 'One-Click POST header not detected'}
                    </span>
                  </li>
                ) : null}
              </ul>
            </section>
          ) : null}
          {report.deliverability ? (
            <section className="grade-detail-card" data-testid="grade-deliverability">
              <h3>MIME Structure &amp; Content Inventory</h3>
              <dl className="grade-meta-grid">
                <div>
                  <dt>Plain text part</dt>
                  <dd>{report.deliverability.plainTextBytes} B</dd>
                </div>
                <div>
                  <dt>HTML part</dt>
                  <dd>{report.deliverability.htmlBytes} B</dd>
                </div>
                <div>
                  <dt>Links</dt>
                  <dd>
                    {report.deliverability.totalLinks} total ({report.deliverability.httpsLinks} HTTPS, {report.deliverability.httpLinks} HTTP)
                  </dd>
                </div>
                <div>
                  <dt>Unique link hosts</dt>
                  <dd>
                    {report.deliverability.uniqueLinkDomains?.length
                      ? report.deliverability.uniqueLinkDomains.join(', ')
                      : 'None'}
                  </dd>
                </div>
                <div>
                  <dt>Images</dt>
                  <dd>
                    {report.deliverability.imageCount} ({report.deliverability.imagesMissingAlt} missing alt)
                  </dd>
                </div>
                <div>
                  <dt>Attachments</dt>
                  <dd>{report.deliverability.attachmentCount}</dd>
                </div>
              </dl>
            </section>
          ) : null}
          {findingGroups.map((group) => (
            <section
              key={group.severity}
              className={`grade-group grade-group-${group.severity}`}
              data-testid={`grade-group-${group.severity}`}
            >
              <h3>{group.title}</h3>
              <ul className="grade-findings">
                {group.findings.map((finding) => (
                  <li key={finding.id} className={`grade-finding grade-finding-${finding.severity}`}>
                    <strong>{finding.title}</strong>
                    {finding.category ? (
                      <em className="grade-finding-category">{finding.category}</em>
                    ) : null}
                    {typeof finding.penalty === 'number' ? (
                      <b className="grade-finding-penalty">
                        {finding.penalty > 0 ? `-${finding.penalty} pts` : '0 pts'}
                      </b>
                    ) : null}
                    <span>{finding.detail}</span>
                    <Link
                      className="grade-finding-guide"
                      to={guidePathFor(finding.id)}
                      data-testid={`grade-finding-guide-${finding.id}`}
                    >
                      {finding.severity === 'pass' ? 'Why this passed' : 'Why & how to fix'}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </section>
      ) : null}
      <GradeOffer />
    </main>
  );
};

export default Grade;
