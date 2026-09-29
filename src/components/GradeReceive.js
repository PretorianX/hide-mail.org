import React, { useCallback, useEffect, useRef, useState } from 'react';
import GradeInboxService from '../services/GradeInboxService';

const POLL_MS = 3000;

/**
 * Mint a Mail Grade-only address, wait for inbound mail, hand raw source to parent.
 */
const GradeReceive = ({ onSourceReady }) => {
  const [address, setAddress] = useState(() => GradeInboxService.getStoredAddress());
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [lastSubject, setLastSubject] = useState(null);
  const pollRef = useRef(null);
  const gradedIdsRef = useRef(new Set());

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const gradeLatest = useCallback(async (email) => {
    const messages = await GradeInboxService.listMessages(email);
    if (!messages.length) {
      return false;
    }
    const latest = messages[0];
    const messageId = latest.id || latest.messageId;
    if (!messageId || gradedIdsRef.current.has(messageId)) {
      return Boolean(messageId && gradedIdsRef.current.has(messageId));
    }
    const raw = await GradeInboxService.getRawSource(email, messageId);
    gradedIdsRef.current.add(messageId);
    setLastSubject(latest.subject || '(no subject)');
    setStatus('received');
    stopPolling();
    onSourceReady(raw);
    return true;
  }, [onSourceReady, stopPolling]);

  const startPolling = useCallback((email) => {
    stopPolling();
    setStatus('waiting');
    pollRef.current = setInterval(async () => {
      try {
        await gradeLatest(email);
      } catch (err) {
        setError(err.message || 'Could not check for mail.');
        setStatus('error');
        stopPolling();
      }
    }, POLL_MS);
  }, [gradeLatest, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  useEffect(() => {
    if (!address) {
      return undefined;
    }
    startPolling(address);
    gradeLatest(address).catch(() => {});
    return undefined;
  }, [address, gradeLatest, startPolling]);

  const onCreate = async () => {
    setError(null);
    setLastSubject(null);
    setStatus('creating');
    try {
      const email = await GradeInboxService.createAddress();
      gradedIdsRef.current = new Set();
      setAddress(email);
    } catch (err) {
      setStatus('error');
      setError(err.message || 'Could not create a Mail Grade address.');
    }
  };

  const onCopy = async () => {
    if (!address || typeof navigator?.clipboard?.writeText !== 'function') {
      return;
    }
    try {
      await navigator.clipboard.writeText(address);
      setStatus((current) => (current === 'received' ? current : 'copied'));
    } catch {
      setError('Could not copy the address.');
    }
  };

  return (
    <section className="grade-receive" data-testid="grade-receive">
      <h2>Or send it to us</h2>
      <p className="grade-receive-lead">
        Get a temporary address on our domain. Send a test message there and we grade the
        raw copy when it arrives.
      </p>
      {!address ? (
        <button
          type="button"
          className="grade-receive-create"
          onClick={onCreate}
          disabled={status === 'creating'}
        >
          {status === 'creating' ? 'Creating address…' : 'Create Mail Grade address'}
        </button>
      ) : (
        <div className="grade-receive-active">
          <label htmlFor="grade-receive-address">Send to</label>
          <div className="grade-receive-row">
            <input
              id="grade-receive-address"
              data-testid="grade-receive-address"
              readOnly
              value={address}
            />
            <button type="button" onClick={onCopy}>
              Copy
            </button>
          </div>
          {status === 'waiting' || status === 'copied' ? (
            <p className="grade-receive-status" data-testid="grade-receive-status">
              {status === 'copied' ? 'Copied. ' : ''}
              Waiting for a message…
            </p>
          ) : null}
          {status === 'received' && lastSubject ? (
            <p className="grade-receive-status" data-testid="grade-receive-status">
              Received “{lastSubject}”. Grading…
            </p>
          ) : null}
          <button type="button" className="grade-receive-create" onClick={onCreate}>
            New address
          </button>
        </div>
      )}
      {error ? <p className="grade-error" role="alert">{error}</p> : null}
    </section>
  );
};

export default GradeReceive;
