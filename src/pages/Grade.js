import React, { useEffect, useState } from 'react';
import GradeService from '../services/GradeService';
import GradeOffer from './GradeOffer';
import './Grade.css';

const Grade = () => {
  const [source, setSource] = useState('');
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

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

  const onSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    if (!source.trim()) {
      setReport(null);
      setError('Paste a raw email first.');
      return;
    }
    setBusy(true);
    try {
      const next = await GradeService.grade(source);
      setReport(next);
    } catch (err) {
      setReport(null);
      setError(err.message || 'Mail Grade could not read that email.');
    } finally {
      setBusy(false);
    }
  };

  const letter = report && /^[A-F]$/.test(report.grade) ? report.grade : null;

  return (
    <main className="grade-page">
      <h1>Mail Grade</h1>
      <p className="grade-lead">
        Paste a raw email. Mail Grade returns a quality report before you send it.
      </p>
      <div className="grade-work">
        <div
          className={`grade-stamp${letter ? ` grade-stamp-${letter}` : ' grade-stamp-empty'}`}
          data-testid="grade-stamp"
          aria-hidden="true"
        >
          <span>{letter || '—'}</span>
        </div>
        <form className="grade-form" onSubmit={onSubmit}>
          <label htmlFor="grade-source">Raw email</label>
          <textarea
            id="grade-source"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            spellCheck="false"
            placeholder={'From: Ada <ada@example.com>\nSubject: Hello\n\nThe message body.'}
          />
          <button type="submit" className="grade-submit" disabled={busy}>
            {busy ? 'Grading…' : 'Grade this email'}
          </button>
          {error ? <p className="grade-error" role="alert">{error}</p> : null}
          {!report && !error ? (
            <p className="grade-empty" data-testid="grade-empty">
              Waiting for an email. Nothing you paste is stored.
            </p>
          ) : null}
        </form>
      </div>
      {report ? (
        <section className="grade-result" aria-live="polite" data-testid="grade-result">
          <h2>
            Grade {report.grade}
            <span className="grade-score"> score {report.score}</span>
          </h2>
          <p>{report.summary}</p>
          <ul className="grade-findings">
            {report.findings.map((finding) => (
              <li key={finding.id} className={`grade-finding grade-finding-${finding.severity}`}>
                <strong>{finding.title}</strong>
                <span>{finding.detail}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <GradeOffer />
    </main>
  );
};

export default Grade;
