import React, { useEffect, useState } from 'react';
import { Link } from 'react-router';
import TlsService from '../services/TlsService';
import LicenseService from '../services/LicenseService';

const HANDOFF_POLL_MS = 1000;
const HANDOFF_POLL_ATTEMPTS = 18;
const HANDOFF_STORAGE_KEY = 'hidemail_tls_handoff_token';

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

const TlsOffer = () => {
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
    TlsService.loadOffer()
      .then((next) => {
        if (!cancelled) {
          setOffer(next);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setOfferError(err.message || 'TLS Reports pricing is unavailable.');
        }
      });
    const saved = TlsService.getKey();
    if (saved) {
      TlsService.validate(saved)
        .then((next) => {
          if (!cancelled) {
            setLicense(next);
          }
        })
        .catch(() => TlsService.clearKey());
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
          paid = await TlsService.fetchHandoff(handoffToken);
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
      sessionStorage.removeItem(HANDOFF_STORAGE_KEY);
      setConfirming(false);
      if (!paid?.licenseKey || (paid.data?.type !== 'tls' && paid.data?.type !== 'suite')) {
        setError('Payment was not confirmed for a TLS Reports plan.');
        return;
      }
      TlsService.saveKey(paid.licenseKey);
      try {
        const next = await TlsService.validate(paid.licenseKey);
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
      const checkout = await LicenseService.checkout('monthly', 'tls');
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
      const next = await TlsService.validate(restoreKey.trim());
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
      const issued = await TlsService.requestApiKey(license.key);
      setApiKey(issued.apiKey);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="tls-offer" aria-labelledby="tls-offer-title">
      <h2 id="tls-offer-title">TLS Reports API</h2>
      <p>
        Read RFC 8460 SMTP TLS reports from a script with{' '}
        <code>POST /api/tls-reports</code> (120 req/min, max 64 KB). A TLS Reports key
        does this job only. A Deliverability Suite key ($19.99/mo) covers this API and the
        other deliverability APIs.{' '}
        <Link to="/pro">Compare plans</Link>.
      </p>
      <p className="tool-explorer-links" data-testid="tls-explorer-links">
        <Link to="/developers?endpoint=tls">Open in API Explorer</Link>
        {' · '}
        <Link to="/developers?tab=mcp&tool=hide_mail_tls_report">
          MCP tool <code>hide_mail_tls_report</code>
        </Link>
      </p>
      {confirming ? <p role="status">Confirming payment…</p> : null}
      {offer ? (
        <p className="tls-offer-price" data-testid="tls-price">
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
        Buy the TLS Reports API
      </button>
      {license ? (
        <div data-testid="tls-license">
          <p>TLS Reports is active for this browser.</p>
          <button type="button" onClick={handleIssue} disabled={busy}>
            {apiKey ? 'Replace API key' : 'Issue API key'}
          </button>
          {apiKey ? <p><code data-testid="tls-api-key">{apiKey}</code></p> : null}
        </div>
      ) : (
        <form className="tls-restore" onSubmit={handleRestore}>
          <label htmlFor="tls-license-key">Already bought? Paste your license key</label>
          <input
            id="tls-license-key"
            value={restoreKey}
            onChange={(event) => setRestoreKey(event.target.value)}
            autoComplete="off"
          />
          <button type="submit" disabled={busy || !restoreKey.trim()}>Restore</button>
        </form>
      )}
      {error ? <p className="tls-error" role="alert">{error}</p> : null}
    </section>
  );
};

export default TlsOffer;
