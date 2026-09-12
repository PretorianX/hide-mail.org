import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Link, useLocation, useNavigate } from 'react-router';
import RestoreKeyService from '../services/RestoreKeyService';
import { formatLifetime } from '../utils/duration';
import { analytics } from '../services/analytics.js';
import './RestoreInbox.css';

/**
 * Second half of the restore flow: turn a key into the mailbox it points at, in this browser.
 *
 * Reached by typing the key here or by opening the link the key panel shows, which carries the
 * key in the query string.
 */
const RestoreInbox = ({ onRestored }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const keyFromLink = new URLSearchParams(location.search || '').get('key') || '';

  const [key, setKey] = useState(keyFromLink);
  const [restored, setRestored] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');

    if (!key.trim()) {
      setError('Enter the restore key you were given, for example HMR-4F7K-2QMT-9XB3.');
      return;
    }

    setBusy(true);

    try {
      const mailbox = await RestoreKeyService.redeem(key);
      setRestored(mailbox);
      analytics.restoreKeyRedeemed('ok');
      onRestored(mailbox.email, mailbox.ttlSeconds);
    } catch (redeemError) {
      setError(redeemError.message);
      analytics.restoreKeyRedeemed(redeemError.code || 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="restore-inbox">
      <h1>Reopen a Hide Mail inbox</h1>

      <p className="restore-inbox-explainer" data-testid="restore-explainer">
        A Hide Mail address normally lives only in the browser that created it. A restore key is a
        short code that points at the address itself, so you can pick the inbox up on another
        device — or in this browser after you cleared its data — for as long as the address is
        alive. Get a key from the <Link to="/">inbox page</Link> on the device that has it.
      </p>

      {restored ? (
        <div className="restore-inbox-success" data-testid="restore-success">
          <p className="restore-inbox-address">{restored.email}</p>
          <p>
            This inbox is now open in this browser
            {formatLifetime(restored.ttlSeconds)
              ? ` for another ${formatLifetime(restored.ttlSeconds)}`
              : ''}
            . Messages already delivered to it are waiting.
          </p>
          <button type="button" onClick={() => navigate('/')}>
            Open the inbox
          </button>
        </div>
      ) : (
        <form className="restore-inbox-form" onSubmit={submit}>
          <label htmlFor="restore-key-input">Restore key</label>
          <input
            id="restore-key-input"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder="HMR-XXXX-XXXX-XXXX"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck="false"
          />
          <button type="submit" disabled={busy}>
            {busy ? 'Reopening...' : 'Reopen inbox'}
          </button>
        </form>
      )}

      {error && <p className="restore-inbox-error" role="alert">{error}</p>}

      <p className="restore-inbox-footnote">
        A key dies with the address it belongs to. A free address lasts 30 minutes, so a key is
        mainly a way to move it to your phone right now; with{' '}
        <Link to="/pro">Hide Mail Pro</Link> an address lasts 24 hours, 7 days or 30 days and the
        key keeps working for that whole time.
      </p>
    </div>
  );
};

RestoreInbox.propTypes = {
  onRestored: PropTypes.func.isRequired,
};

export default RestoreInbox;
