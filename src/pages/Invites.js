import React, { useEffect, useState } from 'react';
import InviteService from '../services/InviteService';
import InviteOffer from './InviteOffer';
import './Invites.css';

/**
 * UI plan for Invite Read, in the existing Hide Mail look.
 * Entry: header link Invites, same plain nav treatment as Home, Blog, About, and Contact.
 * Empty: the meeting stub shows an em dash and no day. The field is blank.
 * Primary action: Read invite.
 * Result: the stub fills with the month, the day, and the method stamp.
 * Error: a red alert replaces the waiting line, focus moves to it, and the stub returns to the em dash.
 * Memorable element: the meeting stub (the date block).
 */

const SAMPLE_INVITE = [
  'From: Ada Lovelace <ada@lab.example>',
  'Subject: Design review',
  'MIME-Version: 1.0',
  'Content-Type: text/calendar; method=REQUEST; charset=UTF-8',
  '',
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'METHOD:REQUEST',
  'BEGIN:VEVENT',
  'UID:design-review-20261112@lab.example',
  'DTSTART:20261112T150000Z',
  'DTEND:20261112T153000Z',
  'SUMMARY:Design review',
  'ORGANIZER;CN=Ada Lovelace:mailto:ada@lab.example',
  'ATTENDEE;CN=Grace Hopper;PARTSTAT=ACCEPTED;ROLE=REQ-PARTICIPANT:mailto:grace@navy.example',
  'LOCATION:Lab 3',
  'END:VEVENT',
  'END:VCALENDAR',
  '',
].join('\n');

const PARTSTAT_LABEL = {
  'NEEDS-ACTION': 'Needs action',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  TENTATIVE: 'Tentative',
  DELEGATED: 'Delegated',
};

const attendeeLine = (attendee) => {
  const who = attendee.name || attendee.email;
  const reply = attendee.partstat
    ? (PARTSTAT_LABEL[attendee.partstat] || attendee.partstat)
    : 'No reply';
  return `${who} — ${reply}`;
};

const Invites = () => {
  const [source, setSource] = useState('');
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!error) {
      return undefined;
    }
    document.getElementById('invite-error')?.focus();
    return undefined;
  }, [error]);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    if (!source.trim()) {
      setReport(null);
      setError('Paste a meeting request first.');
      return;
    }
    setBusy(true);
    try {
      const next = await InviteService.read(source);
      setReport(next);
    } catch (err) {
      setReport(null);
      setError(err.message || 'Invite Read could not read that meeting request.');
    } finally {
      setBusy(false);
    }
  };

  const onChange = (event) => {
    setSource(event.target.value);
    if (error) {
      setError(null);
    }
  };

  const when = report?.when;

  return (
    <main className="invite-page">
      <h1>Invite Read</h1>
      <p className="invite-lead">
        Paste a meeting request. Invite Read shows who sent it, when it is, and whether
        it asks you to accept, update, or cancel.
      </p>
      <form className="invite-form" onSubmit={onSubmit}>
        <div className="invite-stub" data-testid="invite-stub">
          <div
            className={`invite-date${when ? '' : ' invite-date-empty'}`}
            data-testid="invite-date"
          >
            <span className="invite-month">{when ? when.month : '—'}</span>
            {when ? <span className="invite-day">{when.day}</span> : null}
          </div>
          <div className="invite-stub-copy">
            {report ? (
              <>
                <p className="invite-stamp" data-testid="invite-stamp" data-stamp={report.stamp}>
                  {report.stamp}
                </p>
                <p className="invite-summary">{report.summary || 'Untitled meeting'}</p>
                {when?.timeLabel ? <p className="invite-when">{when.timeLabel}</p> : null}
                <p className="invite-organizer">
                  {report.organizer?.name || report.organizer?.email || 'No organizer'}
                </p>
              </>
            ) : (
              <p className="invite-waiting">Who invited you, and when, shows up here.</p>
            )}
          </div>
        </div>
        <label htmlFor="invite-source">Meeting request</label>
        <textarea
          id="invite-source"
          name="source"
          value={source}
          onChange={onChange}
          spellCheck="false"
          autoCorrect="off"
          autoCapitalize="off"
          autoComplete="off"
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? 'invite-error' : 'invite-empty'}
          placeholder={'BEGIN:VCALENDAR\nMETHOD:REQUEST\nBEGIN:VEVENT\nSUMMARY:Design review\nEND:VEVENT\nEND:VCALENDAR'}
        />
        <button type="submit" className="invite-submit" disabled={busy}>
          {busy ? 'Reading…' : 'Read invite'}
        </button>
        <button
          type="button"
          className="invite-sample"
          onClick={() => {
            setSource(SAMPLE_INVITE);
            setError(null);
          }}
          disabled={busy}
        >
          Load sample
        </button>
        {error ? (
          <p
            id="invite-error"
            className="invite-error"
            role="alert"
            tabIndex={-1}
            data-testid="invite-error"
          >
            {error}
          </p>
        ) : (
          <p id="invite-empty" className="invite-empty" data-testid="invite-empty">
            {report
              ? 'Nothing you paste is stored.'
              : 'Waiting for a meeting request. Nothing you paste is stored.'}
          </p>
        )}
      </form>
      {report ? (
        <section className="invite-result" aria-live="polite" data-testid="invite-result">
          <h2>Meeting</h2>
          <dl>
            {report.location ? (
              <div>
                <dt>Where</dt>
                <dd>{report.location}</dd>
              </div>
            ) : null}
            {report.url ? (
              <div>
                <dt>Link</dt>
                <dd>{report.url}</dd>
              </div>
            ) : null}
            {report.attendees.length ? (
              <div>
                <dt>Attendees</dt>
                <dd>{report.attendees.map(attendeeLine).join(', ')}</dd>
              </div>
            ) : null}
            {report.additionalEvents > 0 ? (
              <div>
                <dt>Also in this calendar</dt>
                <dd>{report.additionalEvents} more</dd>
              </div>
            ) : null}
          </dl>
          {report.warnings.length ? (
            <ul className="invite-warnings" data-testid="invite-warnings">
              {report.warnings.map((warning) => (
                <li key={warning.code}>{warning.message}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
      <InviteOffer />
    </main>
  );
};

export default Invites;
