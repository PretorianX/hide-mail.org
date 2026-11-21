import React, { useEffect, useState } from 'react';
import { Link } from 'react-router';
import AccessService from '../services/AccessService';
import LicenseService from '../services/LicenseService';
import { readHandoffToken, clearHandoffToken } from '../utils/handoffToken';

const HANDOFF_POLL_MS = 1000;
const HANDOFF_POLL_ATTEMPTS = 18;
const HANDOFF_STORAGE_KEY = 'hidemail_access_handoff_token';

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const AccessOffer = () => {
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
    AccessService.loadOffer()
      .then((next) => {
        if (!cancelled) {
          setOffer(next);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setOfferError(err.message || 'Access Check pricing is unavailable.');
        }
      });
    const saved = AccessService.getKey();
    if (saved) {
      AccessService.validate(saved)
        .then((next) => {
          if (!cancelled) {
            setLicense(next);
          }
        })
        .catch(() => AccessService.clearKey());
    }
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handoffToken = readHandoffToken(HANDOFF_STORAGE_KEY);
    if (!handoffToken) {
      return undefined;
    }
    let cancelled = false;
    setConfirming(true);

    (async () => {
      let paid = null;
      for (let attempt = 0; attempt < HANDOFF_POLL_ATTEMPTS; attempt += 1) {
        if (cancelled) {
          return;
        }
        try {
          paid = await AccessService.fetchHandoff(handoffToken);
        } catch {
          paid = null;
        }
        if (paid?.licenseKey) {
          break;
        }
        await sleep(HANDOFF_POLL_MS);
      }
      if (cancelled) {
        return;
      }
      clearHandoffToken(HANDOFF_STORAGE_KEY);
      setConfirming(false);
      if (!paid?.licenseKey || (paid.data?.type !== 'access' && paid.data?.type !== 'suite')) {
        setError('Payment was not confirmed for an Access Check plan.');
        return;
      }
      AccessService.saveKey(paid.licenseKey);
      try {
        const next = await AccessService.validate(paid.licenseKey);
        if (!cancelled) {
          setLicense(next);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleBuy = async () => {
    setBusy(true);
    setError(null);
    try {
      const checkout = await LicenseService.checkout('monthly', 'access');
      await LicenseService.submitWayforpayCheckout(checkout);
    } catch (err) {
      setError(err.message || 'Checkout could not start.');
      setBusy(false);
    }
  };

  const handleRestore = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const next = await AccessService.validate(restoreKey.trim());
      setLicense(next);
      setRestoreKey('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleIssue = async () => {
    if (!license?.key) return;
    setBusy(true);
    setError(null);
    try {
      const issued = await AccessService.requestApiKey(license.key);
      setApiKey(issued.apiKey);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="access-offer" aria-labelledby="access-offer-title">
      <h2 id="access-offer-title">Access Check API</h2>
      <p>
        Check campaign HTML from a script with{' '}
        <code>POST /api/access-read</code> (120 req/min, max 64 KB). An Access Check key
        does this job only. A Deliverability Suite key ($19.99/mo) covers this API and the
        other deliverability APIs.{' '}
        <Link to="/pro">Compare plans</Link>.
      </p>
      <p className="tool-explorer-links" data-testid="access-explorer-links">
        <Link to="/developers?endpoint=access">Open in API Explorer</Link>
        {' · '}
        <Link to="/developers?tab=mcp&tool=hide_mail_access_check">
          MCP tool <code>hide_mail_access_check</code>
        </Link>
      </p>
      {confirming ? <p role="status">Confirming payment…</p> : null}
      {offer ? (
        <p className="access-offer-price" data-testid="access-price">
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
        Buy the Access Check API
      </button>
      {license ? (
        <div data-testid="access-license">
          <p>Access Check is active for this browser.</p>
          <button type="button" onClick={handleIssue} disabled={busy}>
            {apiKey ? 'Replace API key' : 'Issue API key'}
          </button>
          {apiKey ? <p><code data-testid="access-api-key">{apiKey}</code></p> : null}
        </div>
      ) : (
        <form className="access-restore" onSubmit={handleRestore}>
          <label htmlFor="access-license-key">Already bought? Paste your license key</label>
          <input
            id="access-license-key"
            value={restoreKey}
            onChange={(event) => setRestoreKey(event.target.value)}
            autoComplete="off"
          />
          <button type="submit" disabled={busy || !restoreKey.trim()}>Restore</button>
        </form>
      )}
      {error ? <p className="access-error" role="alert">{error}</p> : null}
    </section>
  );
};

export default AccessOffer;
