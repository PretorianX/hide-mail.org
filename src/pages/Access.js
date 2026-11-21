import React, { useEffect, useState } from 'react';
import AccessService from '../services/AccessService';
import AccessOffer from './AccessOffer';
import './Access.css';

/**
 * UI plan for Access Check, in the existing Hide Mail look.
 * Entry: header link Access, same plain nav treatment as Home, Blog, About, and Contact.
 * Empty: the access stamp shows an em dash, the field is blank, and the line under the
 * button says the paste is not stored.
 * Primary action: Check this email.
 * Result: the stamp reads CLEAR, FIX, or BLOCKED, and the barriers sit under it.
 * Error: a red alert replaces that line. The stamp returns to an em dash and the previous result is gone.
 * Memorable element: the access stamp.
 */

const SAMPLE_HTML = [
  '<html>',
  '<body style="color:#999999;background-color:#ffffff;font-size:12px">',
  '<h1>November update</h1>',
  '<h3>What changed</h3>',
  '<p>See <a href="https://shop.example/order"></a> the note.</p>',
  '<img src="logo.png">',
  '</body>',
  '</html>',
].join('\n');

const Access = () => {
  const [source, setSource] = useState('');
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!error && !report) {
      return undefined;
    }
    const target = document.querySelector(error ? '[role="alert"]' : '[data-testid="access-result"]');
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
      setError("Paste an email's HTML first.");
      return;
    }
    setBusy(true);
    try {
      const next = await AccessService.read(source);
      setReport(next);
    } catch (err) {
      setReport(null);
      setError(err.message || 'Access Check could not read that email.');
    } finally {
      setBusy(false);
    }
  };

  const onLoadSample = () => {
    setSource(SAMPLE_HTML);
    setError(null);
  };

  return (
    <main className="access-page">
      <h1>Access Check</h1>
      <p className="access-lead">
        Paste an email&apos;s HTML and see what blocks someone from reading it.
      </p>
      <form className="access-form" onSubmit={onSubmit}>
        <div className="access-slip" data-testid="access-slip">
          <div
            className={`access-stamp${report ? '' : ' access-stamp-empty'}`}
            data-testid="access-stamp"
            data-stamp={report ? report.verdict : 'waiting'}
          >
            {report ? report.stamp : '—'}
          </div>
          <div className="access-slip-copy">
            {report ? (
              <p className="access-summary" data-testid="access-summary">{report.summary}</p>
            ) : (
              <p className="access-slip-waiting">The access stamp shows up here.</p>
            )}
          </div>
        </div>
        <label htmlFor="access-source">Email HTML</label>
        <textarea
          id="access-source"
          value={source}
          onChange={(event) => setSource(event.target.value)}
          spellCheck="false"
          placeholder="Paste the HTML, or a raw message that contains an HTML part"
        />
        <div className="access-actions">
          <button type="submit" className="access-submit" disabled={busy}>
            {busy ? 'Checking…' : 'Check this email'}
          </button>
          <button type="button" className="access-sample-btn" onClick={onLoadSample}>
            Load a sample
          </button>
        </div>
        {error ? (
          <p className="access-error" role="alert" data-testid="access-error">{error}</p>
        ) : null}
        {!error && !report ? (
          <p className="access-empty" data-testid="access-empty">
            Nothing you paste is stored.
          </p>
        ) : null}
      </form>
      {report ? (
        <section className="access-result" aria-live="polite" data-testid="access-result">
          <h2>Barriers</h2>
          {report.barriers.length === 0 ? (
            <p>Nothing in this HTML blocks a reader.</p>
          ) : (
            <ul>
              {report.barriers.map((barrier) => (
                <li key={barrier.id}>
                  <strong>{barrier.title}</strong>
                  {barrier.count > 1 ? ` (${barrier.count})` : ''}
                  {' — '}
                  {barrier.detail}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
      <AccessOffer />
    </main>
  );
};

export default Access;
