import React, { useEffect, useState } from 'react';
import ReportsService from '../services/ReportsService';
import ReportsOffer from './ReportsOffer';
import './Reports.css';

const Reports = () => {
  const [xml, setXml] = useState('');
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!error && !report) {
      return undefined;
    }
    const target = document.querySelector(error ? '[role="alert"]' : '[data-testid="reports-result"]');
    if (typeof target?.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    return undefined;
  }, [error, report]);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    if (!xml.trim()) {
      setReport(null);
      setError('Paste a DMARC aggregate report first.');
      return;
    }
    setBusy(true);
    try {
      const next = await ReportsService.read(xml);
      setReport(next);
    } catch (err) {
      setReport(null);
      setError(err.message || 'DMARC Reports could not read that report.');
    } finally {
      setBusy(false);
    }
  };

  const verdict = report?.verdict || null;
  const fill = report ? report.alignedPercent : 0;

  return (
    <main className="reports-page">
      <h1>DMARC Reports</h1>
      <p className="reports-lead">
        Paste a DMARC aggregate report. You get a source-by-source account of which
        mail aligned, and what the receiver did with the rest.
      </p>
      <div className="reports-work">
        <div
          className={`reports-volume${verdict ? ` reports-volume-${verdict.toLowerCase()}` : ' reports-volume-empty'}`}
          data-testid="reports-volume"
        >
          <div className="reports-volume-track" aria-hidden="true">
            <div
              className="reports-volume-fill"
              data-testid="reports-volume-fill"
              style={{ width: `${fill}%` }}
            />
          </div>
          <p className="reports-volume-stamp" data-testid="reports-volume-stamp">
            {verdict || '—'}
          </p>
          <p className="reports-volume-count">
            {report ? `${report.totals.aligned} of ${report.totals.messages} aligned` : 'No messages yet'}
          </p>
        </div>
        <form className="reports-form" onSubmit={onSubmit}>
          <label htmlFor="reports-xml">Aggregate report</label>
          <textarea
            id="reports-xml"
            value={xml}
            onChange={(event) => setXml(event.target.value)}
            spellCheck="false"
            placeholder={'<?xml version="1.0"?>\n<feedback>\n  <report_metadata>…</report_metadata>\n</feedback>'}
          />
          <button type="submit" className="reports-submit" disabled={busy}>
            {busy ? 'Reading…' : 'Read this report'}
          </button>
          {error ? <p className="reports-error" role="alert">{error}</p> : null}
          {!report && !error ? (
            <p className="reports-empty" data-testid="reports-empty">
              Waiting for a report. Nothing you paste is stored.
            </p>
          ) : null}
        </form>
      </div>
      {report ? (
        <section className="reports-result" aria-live="polite" data-testid="reports-result">
          <h2>
            {report.verdict}
            <span className="reports-score"> {report.domain}</span>
          </h2>
          <p>{report.summary}</p>
          <dl className="reports-meta">
            <div>
              <dt>Reporter</dt>
              <dd>{report.orgName}</dd>
            </div>
            <div>
              <dt>Policy</dt>
              <dd>{report.policy}</dd>
            </div>
            <div>
              <dt>Dates</dt>
              <dd>{report.begin} – {report.end}</dd>
            </div>
            <div>
              <dt>Report id</dt>
              <dd>{report.reportId}</dd>
            </div>
          </dl>
          {report.sources.length > 0 ? (
            <ul className="reports-sources">
              {report.sources.map((source, index) => (
                <li key={`${source.sourceIp}-${source.headerFrom}-${source.disposition}-${index}`}>
                  <strong>{source.sourceIp}</strong>
                  <span>{source.count} messages</span>
                  <span>DKIM {source.dkim}</span>
                  <span>SPF {source.spf}</span>
                  <span>{source.disposition}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="reports-empty">No sources in this report.</p>
          )}
        </section>
      ) : null}
      <ReportsOffer />
    </main>
  );
};

export default Reports;
