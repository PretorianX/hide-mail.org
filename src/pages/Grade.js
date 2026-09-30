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
      <GradeReceive onSourceReady={onReceiveSource} />
      {report ? (
        <section className="grade-result" aria-live="polite" data-testid="grade-result">
          <h2>
            Grade {report.grade}
            <span className="grade-score"> score {report.score}</span>
          </h2>
          <p>{report.summary}</p>
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
