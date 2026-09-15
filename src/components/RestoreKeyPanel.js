import React, { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router';
import RestoreKeyService from '../services/RestoreKeyService';
import { formatLifetime } from '../utils/duration';
import { analytics } from '../services/analytics.js';
import './RestoreKeyPanel.css';

/**
 * Hands the current mailbox a short code that reopens it somewhere else.
 *
 * The key expires with the mailbox, so the panel states that lifetime rather than a promise it
 * cannot keep. On a free address that ceiling is 30 minutes, which is where the Pro lifetimes
 * become the answer.
 */
const RestoreKeyPanel = ({ email, isPro }) => {
  const [restoreKey, setRestoreKey] = useState(null);
  const [ttlSeconds, setTtlSeconds] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setRestoreKey(null);
    setTtlSeconds(null);
    setError('');
    setCopied(false);
  }, [email]);

  const issue = useCallback(async (rotate) => {
    setBusy(true);
    setError('');
    setCopied(false);

    try {
      const issued = await RestoreKeyService.issue(email, { rotate });
      setRestoreKey(issued.key);
      setTtlSeconds(issued.ttlSeconds);
      analytics.restoreKeyIssued(rotate);
    } catch (issueError) {
      setError(issueError.message);
    } finally {
      setBusy(false);
    }
  }, [email]);

  const forget = async () => {
    setBusy(true);
    setError('');

    try {
      await RestoreKeyService.revoke(email);
      setRestoreKey(null);
      setTtlSeconds(null);
      setCopied(false);
    } catch (revokeError) {
      setError(revokeError.message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(restoreKey);
    setCopied(true);
  };

  if (!email) {
    return null;
  }

  const lifetime = formatLifetime(ttlSeconds);

  return (
    <div className="restore-key-panel">
      <h3>Reopen this inbox anywhere</h3>
      <p className="restore-key-intro">
        This address only lives in this browser. A restore key reopens it on your phone, in
        another browser, or after you clear site data.
      </p>

      {restoreKey ? (
        <>
          <p className="restore-key-code" data-testid="restore-key-value">{restoreKey}</p>
          <p className="restore-key-expiry" data-testid="restore-key-expiry">
            {lifetime
              ? `Works for the next ${lifetime}, as long as this address does.`
              : 'Works as long as this address does.'}
          </p>
          <div className="restore-key-actions">
            <button type="button" onClick={copy} disabled={busy}>
              {copied ? 'Copied!' : 'Copy key'}
            </button>
            <button type="button" onClick={() => issue(true)} disabled={busy}>
              New key
            </button>
            <button type="button" onClick={forget} disabled={busy}>
              Forget key
            </button>
          </div>
          <p className="restore-key-hint">
            On the other device, open{' '}
            <a
              className="restore-key-link"
              data-testid="restore-key-link"
              href={`/restore?key=${encodeURIComponent(restoreKey)}`}
            >
              hide-mail.org/restore
            </a>{' '}
            and enter the key.
          </p>
          {!isPro && (
            <p className="restore-key-upgrade" data-testid="restore-key-upgrade">
              A free address is deleted after 30 minutes, and the key goes with it.{' '}
              <Link
                to="/pro"
                data-testid="restore-key-upgrade-link"
                onClick={() => analytics.restoreKeyProClick()}
              >
                Hide Mail Pro
              </Link>{' '}
              keeps an address for 24 hours, 7 days or 30 days, so the same key still reopens it
              when a site asks you to verify again next week.
            </p>
          )}
        </>
      ) : (
        <div className="restore-key-actions">
          <button type="button" onClick={() => issue(false)} disabled={busy}>
            {busy ? 'Creating...' : 'Get a restore key'}
          </button>
        </div>
      )}

      {error && <p className="restore-key-error" role="alert">{error}</p>}

      <p className="restore-key-footnote">
        Have a key already?{' '}
        <Link className="restore-key-link" data-testid="restore-page-link" to="/restore">
          Reopen an inbox
        </Link>
        .
      </p>
    </div>
  );
};

RestoreKeyPanel.propTypes = {
  email: PropTypes.string,
  isPro: PropTypes.bool,
};

export default RestoreKeyPanel;
