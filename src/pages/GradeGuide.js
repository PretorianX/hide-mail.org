import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import { guideEntries } from '../data/mailGradeGuide';
import './GradeGuide.css';

const GradeGuide = () => {
  const location = useLocation();
  const entries = guideEntries();

  useEffect(() => {
    const id = location.hash.replace(/^#/, '');
    if (!id) {
      return undefined;
    }
    const target = document.getElementById(id);
    if (typeof target?.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
    return undefined;
  }, [location.hash]);

  return (
    <main className="grade-guide-page">
      <p className="grade-guide-back">
        <Link to="/grade">← Mail Grade</Link>
      </p>
      <h1>Mail Grade findings guide</h1>
      <p className="grade-guide-lead">
        What each finding means and how to fix it before you send.
      </p>
      <ol className="grade-guide-list">
        {entries.map((entry) => (
          <li key={entry.id} id={entry.id} className="grade-guide-entry">
            <h2>{entry.title}</h2>
            <p>
              <strong>Why it matters.</strong>
              {' '}
              {entry.cause}
            </p>
            <p>
              <strong>What to do.</strong>
              {' '}
              {entry.fix}
            </p>
          </li>
        ))}
      </ol>
    </main>
  );
};

export default GradeGuide;
