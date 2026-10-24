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

const Complaints = () => {
  const [source, setSource] = useState('');
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

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

  const facts = report ? [
    ['Feedback type', report.feedbackType],
    ['Source IP', report.sourceIp],
    ['Reported domain', report.reportedDomain],
    ['Mail from', report.mailFrom],
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
          spellCheck="false"
          placeholder={'Feedback-Type: abuse\nOriginal-Rcpt-To: <subscriber@example.net>\nSource-IP: 192.0.2.1'}
        />
        <button type="submit" className="complaint-submit" disabled={busy}>
          {busy ? 'Reading…' : 'Read this complaint'}
        </button>
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
          <h2>{report.stamp}</h2>
          <dl>
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      <ComplaintOffer />
    </main>
  );
};

export default Complaints;
