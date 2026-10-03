import React, { useEffect, useState } from 'react';
import SenderService from '../services/SenderService';
import SenderOffer from './SenderOffer';
import './Sender.css';

const EMPTY_SLOTS = [
  { id: 'mx', name: 'MX' },
  { id: 'spf', name: 'SPF' },
  { id: 'dmarc', name: 'DMARC' },
];

const Sender = () => {
  const [domain, setDomain] = useState('');
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!error && !report) {
      return undefined;
    }
    const target = document.querySelector(error ? '[role="alert"]' : '[data-testid="sender-result"]');
    if (typeof target?.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    return undefined;
  }, [error, report]);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    if (!domain.trim()) {
      setReport(null);
      setError('Enter a domain name.');
      return;
    }
    setBusy(true);
    try {
      const next = await SenderService.check(domain);
      setReport(next);
    } catch (err) {
      setReport(null);
      setError(err.message || 'Sender Check could not look up that domain.');
    } finally {
      setBusy(false);
    }
  };

  const slots = report ? report.records : EMPTY_SLOTS;
  const verdict = report ? report.verdict : null;

  return (
    <main className="sender-page">
      <h1>Sender Check</h1>
      <p className="sender-lead">
        Enter a domain. Sender Check reads its MX, SPF, and DMARC records and tells you
        whether receivers can enforce a sender policy. The name is not stored.
      </p>
      <div className="sender-work">
        <section
          className={`sender-policy-card${verdict ? ` sender-verdict-${verdict.toLowerCase()}` : ' sender-verdict-empty'}`}
          data-testid="sender-policy-card"
          aria-label="Sender policy"
        >
          <p className="sender-verdict" data-testid="sender-verdict">{verdict || '—'}</p>
          <ul className="sender-slots">
            {slots.map((slot) => (
              <li
                key={slot.id}
                className={`sender-slot${slot.status ? ` sender-slot-${slot.status}` : ''}`}
                data-testid={`sender-slot-${slot.id}`}
              >
                <span className="sender-slot-name">{slot.name}</span>
                <span className="sender-slot-detail">{slot.detail || '—'}</span>
              </li>
            ))}
          </ul>
        </section>
        <form className="sender-form" onSubmit={onSubmit}>
          <label htmlFor="sender-domain">Domain</label>
          <input
            id="sender-domain"
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            spellCheck="false"
            autoComplete="off"
            inputMode="url"
            placeholder="example.com"
          />
          <button type="submit" className="sender-submit" disabled={busy}>
            {busy ? 'Checking…' : 'Check this domain'}
          </button>
          {error ? <p className="sender-error" role="alert">{error}</p> : null}
          {!report && !error ? (
            <p className="sender-empty" data-testid="sender-empty">
              Waiting for a domain. Nothing you type is stored.
            </p>
          ) : null}
        </form>
      </div>
      {report ? (
        <section className="sender-result" aria-live="polite" data-testid="sender-result">
          <h2>{report.verdict}</h2>
          <p>{report.summary}</p>
          <dl className="sender-published">
            {report.records.map((record) => (
              <div key={record.id}>
                <dt>{record.name}</dt>
                <dd>{record.record || 'Not published'}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      <SenderOffer />
    </main>
  );
};

export default Sender;
