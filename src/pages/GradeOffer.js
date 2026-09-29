import React, { useEffect, useState } from 'react';
import GradeService from '../services/GradeService';
import LicenseService from '../services/LicenseService';

const HANDOFF_POLL_MS = 1000;
const HANDOFF_POLL_ATTEMPTS = 18;
const HANDOFF_STORAGE_KEY = 'hidemail_grade_handoff_token';

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

const GradeOffer = () => {
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
    GradeService.loadOffer()
      .then((next) => {
        if (!cancelled) {
          setOffer(next);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setOfferError(err.message || 'Mail Grade pricing is unavailable.');
        }
      });
    const saved = GradeService.getKey();
    if (saved) {
      GradeService.validate(saved)
        .then((next) => {
          if (!cancelled) {
            setLicense(next);
          }
        })
        .catch(() => GradeService.clearKey());
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
          paid = await GradeService.fetchHandoff(handoffToken);
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
      if (!paid?.licenseKey || paid.data?.type !== 'grade') {
        setConfirming(false);
        setError(paid?.licenseKey
          ? 'That payment is not a Mail Grade plan.'
          : 'Payment is still confirming. Refresh this page in a moment.');
        return;
      }
      try {
        const next = await GradeService.validate(paid.licenseKey);
        const issued = await GradeService.requestApiKey(paid.licenseKey);
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
      const checkout = await LicenseService.checkout('monthly', 'grade');
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
      const next = await GradeService.validate(restoreKey.trim());
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
      const issued = await GradeService.requestApiKey(license.key);
      setApiKey(issued.apiKey);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="grade-offer" aria-labelledby="grade-offer-title">
      <h2 id="grade-offer-title">Mail Grade API</h2>
      <p>
        Score mail from a script. <code>POST /api/mail-grade</code> with a Mail Grade key.
        A QA mailbox key does not work here, and this plan does not change the inbox.
      </p>
      {confirming ? <p role="status">Confirming payment…</p> : null}
      {offer ? (
        <p className="grade-offer-price" data-testid="grade-price">
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
        Buy the Mail Grade API
      </button>
      {license ? (
        <div data-testid="grade-license">
          <p>Mail Grade is active for this browser.</p>
          <button type="button" onClick={handleIssue} disabled={busy}>
            {apiKey ? 'Replace API key' : 'Issue API key'}
          </button>
          {apiKey ? <p><code data-testid="grade-api-key">{apiKey}</code></p> : null}
        </div>
      ) : (
        <form className="grade-restore" onSubmit={handleRestore}>
          <label htmlFor="grade-license-key">Already bought? Paste your license key</label>
          <input
            id="grade-license-key"
            value={restoreKey}
            onChange={(event) => setRestoreKey(event.target.value)}
            autoComplete="off"
          />
          <button type="submit" disabled={busy || !restoreKey.trim()}>Restore</button>
        </form>
      )}
      {error ? <p className="grade-error" role="alert">{error}</p> : null}
    </section>
  );
};

export default GradeOffer;
