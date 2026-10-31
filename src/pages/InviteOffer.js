import React, { useEffect, useState } from 'react';
import { Link } from 'react-router';
import InviteService from '../services/InviteService';
import LicenseService from '../services/LicenseService';

const HANDOFF_POLL_MS = 1000;
const HANDOFF_POLL_ATTEMPTS = 18;
const HANDOFF_STORAGE_KEY = 'hidemail_invite_handoff_token';

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const readHandoffToken = () => {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('handoffToken') || params.get('handoff_token');
  if (fromUrl) {
    sessionStorage.setItem(HANDOFF_STORAGE_KEY, fromUrl);
    return fromUrl;
  }
  return sessionStorage.getItem(HANDOFF_STORAGE_KEY);
};

const InviteOffer = () => {
  const [offer, setOffer] = useState(null);
  const [offerError, setOfferError] = useState(null);
  const [license, setLicense] = useState(null);
  const [apiKey, setApiKey] = useState(null);
  const [restoreKey, setRestoreKey] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    InviteService.loadOffer()
      .then((next) => {
        if (!cancelled) {
          setOffer(next);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setOfferError(err.message || 'Invite Read pricing is unavailable.');
        }
      });
    const saved = InviteService.getKey();
    if (saved) {
      InviteService.validate(saved)
        .then((next) => {
          if (!cancelled) {
            setLicense(next);
          }
        })
        .catch(() => InviteService.clearKey());
    }
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handoffToken = readHandoffToken();
    if (!handoffToken) {
      return undefined;
    }
    window.history.replaceState({}, '', window.location.pathname);
    let cancelled = false;
    setConfirming(true);

    (async () => {
      let paid = null;
      for (let attempt = 0; attempt < HANDOFF_POLL_ATTEMPTS; attempt += 1) {
        if (cancelled) {
          return;
        }
        try {
          paid = await InviteService.fetchHandoff(handoffToken);
        } catch {
          paid = null;
        }
        if (paid?.licenseKey) {
          break;
        }
        if (attempt < HANDOFF_POLL_ATTEMPTS - 1) {
          await sleep(HANDOFF_POLL_MS);
        }
      }
      if (cancelled) {
        return;
      }
      sessionStorage.removeItem(HANDOFF_STORAGE_KEY);
      if (!paid?.licenseKey || (paid.data?.type !== 'invite' && paid.data?.type !== 'suite')) {
        setConfirming(false);
        setError(paid?.licenseKey
          ? 'That payment is not an Invite Read or Deliverability Suite plan.'
          : 'Payment is still confirming. Refresh this page in a moment.');
        return;
      }
      try {
        const next = await InviteService.validate(paid.licenseKey);
        const issued = await InviteService.requestApiKey(paid.licenseKey);
        if (cancelled) {
          return;
        }
        setLicense(next);
        setApiKey(issued.apiKey);
        setConfirming(false);
      } catch (err) {
        if (!cancelled) {
          setConfirming(false);
          setError(err.message);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleBuy = async () => {
    setError(null);
    setBusy(true);
    try {
      const checkout = await LicenseService.checkout('monthly', 'invite');
      LicenseService.submitWayforpayCheckout(checkout);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async (event) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const next = await InviteService.validate(restoreKey.trim());
      setLicense(next);
      setRestoreKey('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleIssue = async () => {
    setError(null);
    setBusy(true);
    try {
      const issued = await InviteService.requestApiKey(license.key);
      setApiKey(issued.apiKey);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="invite-offer" aria-labelledby="invite-offer-title">
      <h2 id="invite-offer-title">Invite Read API</h2>
      <p>
        Read meeting requests from a script with <code>POST /api/invite-read</code>.
        An Invite Read key does only this. A Deliverability Suite key covers it with the other tools.
        {' '}
        <Link to="/pro">Compare plans</Link>.
      </p>
      <p className="tool-explorer-links" data-testid="invite-explorer-links">
        <Link to="/developers?endpoint=invites">Open in API Explorer</Link>
        {' · '}
        <Link to="/developers?tab=mcp&tool=hide_mail_invite_read">
          MCP tool <code>hide_mail_invite_read</code>
        </Link>
      </p>
      {confirming ? <p role="status">Confirming payment…</p> : null}
      {offer ? (
        <p className="invite-offer-price" data-testid="invite-price">
          ${offer.usd} per month
        </p>
      ) : null}
      {offerError ? <p role="alert">{offerError}</p> : null}
      {offer?.checkoutPaused ? (
        <p>Card checkout is paused. The report above stays free.</p>
      ) : null}
      <button
        type="button"
        onClick={handleBuy}
        disabled={busy || !offer || offer.checkoutPaused}
      >
        Buy the Invite Read API
      </button>
      {license ? (
        <div data-testid="invite-license">
          <p>Invite Read is active for this browser ({license.type === 'suite' ? 'Deliverability Suite' : 'Invite Read'}).</p>
          <button type="button" onClick={handleIssue} disabled={busy}>
            {apiKey ? 'Replace API key' : 'Issue API key'}
          </button>
          {apiKey ? <p><code data-testid="invite-api-key">{apiKey}</code></p> : null}
        </div>
      ) : (
        <form className="invite-restore" onSubmit={handleRestore}>
          <label htmlFor="invite-license-key">Already bought? Paste your license key</label>
          <input
            id="invite-license-key"
            value={restoreKey}
            onChange={(event) => setRestoreKey(event.target.value)}
            autoComplete="off"
            spellCheck="false"
          />
          <button type="submit" disabled={busy || !restoreKey.trim()}>Restore</button>
        </form>
      )}
      {error ? <p className="invite-error" role="alert">{error}</p> : null}
    </section>
  );
};

export default InviteOffer;
