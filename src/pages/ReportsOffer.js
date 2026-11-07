import React, { useEffect, useState } from 'react';
import { Link } from 'react-router';
import ReportsService from '../services/ReportsService';
import LicenseService from '../services/LicenseService';

const HANDOFF_POLL_MS = 1000;
const HANDOFF_POLL_ATTEMPTS = 18;
const HANDOFF_STORAGE_KEY = 'hidemail_reports_handoff_token';

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

const ReportsOffer = () => {
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
    ReportsService.loadOffer()
      .then((next) => {
        if (!cancelled) {
          setOffer(next);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setOfferError(err.message || 'DMARC Reports pricing is unavailable.');
        }
      });
    const saved = ReportsService.getKey();
    if (saved) {
      ReportsService.validate(saved)
        .then((next) => {
          if (!cancelled) {
            setLicense(next);
          }
        })
        .catch(() => ReportsService.clearKey());
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
          paid = await ReportsService.fetchHandoff(handoffToken);
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
      if (!paid?.licenseKey || (paid.data?.type !== 'reports' && paid.data?.type !== 'suite')) {
        setConfirming(false);
        setError(paid?.licenseKey
          ? 'That payment is not a DMARC Reports or Deliverability Suite plan.'
          : 'Payment is still confirming. Refresh this page in a moment.');
        return;
      }
      try {
        const next = await ReportsService.validate(paid.licenseKey);
        const issued = await ReportsService.requestApiKey(paid.licenseKey);
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
      const checkout = await LicenseService.checkout('monthly', 'reports');
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
      const next = await ReportsService.validate(restoreKey.trim());
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
      const issued = await ReportsService.requestApiKey(license.key);
      setApiKey(issued.apiKey);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="reports-offer" aria-labelledby="reports-offer-title">
      <h2 id="reports-offer-title">DMARC Reports API &amp; Deliverability Suite</h2>
      <p>
        Parse RFC 7489 aggregate XML reports from your monitoring job via{' '}
        <code>POST /api/dmarc-reports</code> (60 req/min, max 512 KB). Authenticate with a{' '}
        <strong>Deliverability Suite</strong> key ($19.99/mo — unlocks all 6 deliverability APIs,
        QA mailboxes, and Pro inbox with one key) or a standalone DMARC Reports key.{' '}
        <Link to="/pro">Compare all 4 plans</Link>.
      </p>
      <p className="tool-explorer-links" data-testid="reports-explorer-links">
        <Link to="/developers?endpoint=reports">Open in API Explorer</Link>
        {' · '}
        <Link to="/developers?tab=mcp&tool=hide_mail_dmarc_report">
          MCP Server Setup &amp; Tool Schema (<code>hide_mail_dmarc_report</code>)
        </Link>
      </p>
      {confirming ? <p role="status">Confirming payment…</p> : null}
      {offer ? (
        <p className="reports-offer-price" data-testid="reports-price">
          ${offer.usd} per month <span className="tool-suite-note">· or $19.99/mo for the full Deliverability Suite</span>
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
        Buy the DMARC Reports API
      </button>
      {license ? (
        <div data-testid="reports-license">
          <p>DMARC Reports is active for this browser ({license.type === 'suite' ? 'Deliverability Suite' : 'DMARC Reports'}).</p>
          <button type="button" onClick={handleIssue} disabled={busy}>
            {apiKey ? 'Replace API key' : 'Issue API key'}
          </button>
          {apiKey ? <p><code data-testid="reports-api-key">{apiKey}</code></p> : null}
        </div>
      ) : (
        <form className="reports-restore" onSubmit={handleRestore}>
          <label htmlFor="reports-license-key">Already bought? Paste your license key (Suite or DMARC Reports)</label>
          <input
            id="reports-license-key"
            value={restoreKey}
            onChange={(event) => setRestoreKey(event.target.value)}
            autoComplete="off"
          />
          <button type="submit" disabled={busy || !restoreKey.trim()}>Restore</button>
        </form>
      )}
      {error ? <p className="reports-error" role="alert">{error}</p> : null}
    </section>
  );
};

export default ReportsOffer;
