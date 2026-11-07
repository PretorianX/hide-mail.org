import React, { useEffect, useState } from 'react';
import { Link } from 'react-router';
import OneClickService from '../services/OneClickService';
import LicenseService from '../services/LicenseService';

const HANDOFF_POLL_MS = 1000;
const HANDOFF_POLL_ATTEMPTS = 18;
const HANDOFF_STORAGE_KEY = 'hidemail_oneclick_handoff_token';

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

const OneClickOffer = () => {
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
    OneClickService.loadOffer()
      .then((next) => {
        if (!cancelled) {
          setOffer(next);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setOfferError(err.message || 'One-Click pricing is unavailable.');
        }
      });
    const saved = OneClickService.getKey();
    if (saved) {
      OneClickService.validate(saved)
        .then((next) => {
          if (!cancelled) {
            setLicense(next);
          }
        })
        .catch(() => OneClickService.clearKey());
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
          paid = await OneClickService.fetchHandoff(handoffToken);
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
      if (!paid?.licenseKey || (paid.data?.type !== 'oneclick' && paid.data?.type !== 'suite')) {
        setConfirming(false);
        setError(paid?.licenseKey
          ? 'That payment is not a One-Click or Deliverability Suite plan.'
          : 'Payment is still confirming. Refresh this page in a moment.');
        return;
      }
      try {
        const next = await OneClickService.validate(paid.licenseKey);
        const issued = await OneClickService.requestApiKey(paid.licenseKey);
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
      const checkout = await LicenseService.checkout('monthly', 'oneclick');
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
      const next = await OneClickService.validate(restoreKey.trim());
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
      const issued = await OneClickService.requestApiKey(license.key);
      setApiKey(issued.apiKey);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="oneclick-offer" aria-labelledby="oneclick-offer-title">
      <h2 id="oneclick-offer-title">One-Click API</h2>
      <p>
        Check the one-click rule in your send pipeline via{' '}
        <code>POST /api/one-click-read</code>. A One-Click key does this job and nothing else.
        A Deliverability Suite key unlocks all 6 deliverability APIs.{' '}
        <Link to="/pro">Compare plans</Link>.
      </p>
      <p className="tool-explorer-links" data-testid="oneclick-explorer-links">
        <Link to="/developers?endpoint=one-click">Open in API Explorer</Link>
        {' · '}
        <Link to="/developers?tab=mcp&tool=hide_mail_one_click">
          MCP tool <code>hide_mail_one_click</code>
        </Link>
      </p>
      {confirming ? <p role="status">Confirming payment…</p> : null}
      {offer ? (
        <p className="oneclick-offer-price" data-testid="oneclick-price">
          ${offer.usd} per month
        </p>
      ) : null}
      {offerError ? <p role="alert">{offerError}</p> : null}
      {offer?.checkoutPaused ? (
        <p>Card checkout is paused. The check above stays free.</p>
      ) : null}
      <button
        type="button"
        onClick={handleBuy}
        disabled={busy || !offer || offer.checkoutPaused}
      >
        Buy the One-Click API
      </button>
      {license ? (
        <div data-testid="oneclick-license">
          <p>One-Click is active for this browser ({license.type === 'suite' ? 'Deliverability Suite' : 'One-Click'}).</p>
          <button type="button" onClick={handleIssue} disabled={busy}>
            {apiKey ? 'Replace API key' : 'Issue API key'}
          </button>
          {apiKey ? <p><code data-testid="oneclick-api-key">{apiKey}</code></p> : null}
        </div>
      ) : (
        <form className="oneclick-restore" onSubmit={handleRestore}>
          <label htmlFor="oneclick-license-key">Already bought? Paste your license key</label>
          <input
            id="oneclick-license-key"
            value={restoreKey}
            onChange={(event) => setRestoreKey(event.target.value)}
            autoComplete="off"
          />
          <button type="submit" disabled={busy || !restoreKey.trim()}>Restore</button>
        </form>
      )}
      {error ? <p className="oneclick-error" role="alert">{error}</p> : null}
    </section>
  );
};

export default OneClickOffer;
