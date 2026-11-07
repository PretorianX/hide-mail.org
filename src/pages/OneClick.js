import React, { useEffect, useState } from 'react';
import OneClickService from '../services/OneClickService';
import OneClickOffer from './OneClickOffer';
import './OneClick.css';

/**
 * UI plan for One-Click, in the existing Hide Mail look.
 * Entry: header link One-Click, same plain nav treatment as Home, Blog, About, and Contact.
 * Empty: the one-click stamp shows an em dash, the field is blank, and the line under the
 * button says the paste is not stored.
 * Primary action: Check one-click.
 * Result: the stamp reads PASS or FAIL, and the slip names the https URL a receiver would POST,
 * or the reasons it cannot.
 * Error: a red alert replaces that line. The stamp returns to an em dash and the previous result is gone.
 * Memorable element: the one-click stamp.
 */

const OneClick = () => {
  const [source, setSource] = useState('');
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!error && !report) {
      return undefined;
    }
    const target = document.querySelector(error ? '[role="alert"]' : '[data-testid="oneclick-result"]');
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
      setError('Paste a message first.');
      return;
    }
    setBusy(true);
    try {
      const next = await OneClickService.read(source);
      setReport(next);
    } catch (err) {
      setReport(null);
      setError(err.message || 'One-Click could not check that message.');
    } finally {
      setBusy(false);
    }
  };

  const facts = report ? [
    ['POST URL', report.postUri],
    ['List-Unsubscribe-Post', report.postHeader],
    ['Mailto', report.mailtoUris?.length ? report.mailtoUris.join(', ') : null],
    ['HTTP', report.httpUris?.length ? report.httpUris.join(', ') : null],
  ].filter(([, value]) => value) : [];

  return (
    <main className="oneclick-page">
      <h1>One-Click</h1>
      <p className="oneclick-lead">
        Paste a message you are about to send. One-Click says whether a receiver
        can unsubscribe with a single POST.
      </p>
      <form className="oneclick-form" onSubmit={onSubmit}>
        <div className="oneclick-slip" data-testid="oneclick-slip">
          <div
            className={`oneclick-stamp${report ? '' : ' oneclick-stamp-empty'}`}
            data-testid="oneclick-stamp"
            data-verdict={report ? report.verdict : 'empty'}
            aria-hidden="true"
          >
            <span>{report ? report.stamp : '—'}</span>
          </div>
          <div className="oneclick-slip-copy">
            {report ? (
              <>
                <p className="oneclick-url" data-testid="oneclick-url">
                  {report.postUri || 'No one-click URL'}
                </p>
                <p className="oneclick-summary">{report.summary}</p>
              </>
            ) : (
              <p className="oneclick-waiting">The one-click URL shows up here.</p>
            )}
          </div>
        </div>
        <label htmlFor="oneclick-source">Message</label>
        <textarea
          id="oneclick-source"
          value={source}
          onChange={(event) => setSource(event.target.value)}
          spellCheck="false"
          placeholder={'From: News <news@sender.example>\nList-Unsubscribe: <https://sender.example/unsub>\nList-Unsubscribe-Post: List-Unsubscribe=One-Click'}
        />
        <button type="submit" className="oneclick-submit" disabled={busy}>
          {busy ? 'Checking…' : 'Check one-click'}
        </button>
        {error ? (
          <p className="oneclick-error" role="alert" data-testid="oneclick-error">{error}</p>
        ) : null}
        {!report && !error ? (
          <p className="oneclick-empty" data-testid="oneclick-empty">
            Waiting for a message. Nothing you paste is stored.
          </p>
        ) : null}
      </form>
      {report ? (
        <section className="oneclick-result" aria-live="polite" data-testid="oneclick-result">
          <h2>{report.stamp}</h2>
          {report.reasons?.length ? (
            <ul data-testid="oneclick-reasons">
              {report.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}
          {facts.length ? (
            <dl>
              {facts.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </section>
      ) : null}
      <OneClickOffer />
    </main>
  );
};

export default OneClick;
