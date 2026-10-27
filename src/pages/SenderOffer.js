import React, { useEffect, useState } from 'react';
import { Link } from 'react-router';
import SenderService from '../services/SenderService';
import LicenseService from '../services/LicenseService';

const CURL_SNIPPET = `curl -X POST https://hide-mail.org/api/sender-check \\
  -H "Authorization: Bearer hm_api_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"domain":"example.com"}'`;

const MCP_SNIPPET = `{
  "mcpServers": {
    "hide-mail": {
      "url": "https://hide-mail.org/api/mcp",
      "headers": {
        "X-API-Key": "hm_live_..."
      }
    }
  }
}`;

const HANDOFF_POLL_MS = 1000;
const HANDOFF_POLL_ATTEMPTS = 18;
const HANDOFF_STORAGE_KEY = 'hidemail_sender_handoff_token';

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

const SenderOffer = () => {
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
    SenderService.loadOffer()
      .then((next) => {
        if (!cancelled) {
          setOffer(next);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setOfferError(err.message || 'Sender Check pricing is unavailable.');
        }
      });
    const saved = SenderService.getKey();
    if (saved) {
      SenderService.validate(saved)
        .then((next) => {
          if (!cancelled) {
            setLicense(next);
          }
        })
        .catch(() => SenderService.clearKey());
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
          paid = await SenderService.fetchHandoff(handoffToken);
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
      if (!paid?.licenseKey || (paid.data?.type !== 'sender' && paid.data?.type !== 'suite')) {
        setConfirming(false);
        setError(paid?.licenseKey
          ? 'That payment is not a Sender Check or Deliverability Suite plan.'
          : 'Payment is still confirming. Refresh this page in a moment.');
        return;
      }
      try {
        const next = await SenderService.validate(paid.licenseKey);
        const issued = await SenderService.requestApiKey(paid.licenseKey);
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
      const checkout = await LicenseService.checkout('monthly', 'sender');
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
      const next = await SenderService.validate(restoreKey.trim());
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
      const issued = await SenderService.requestApiKey(license.key);
      setApiKey(issued.apiKey);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="sender-offer" aria-labelledby="sender-offer-title">
      <h2 id="sender-offer-title">Sender Check API &amp; Deliverability Suite</h2>
      <p>
        Audit customer or sending domains from a script via <code>POST /api/sender-check</code>{' '}
        (60 req/min). Authenticate with a <strong>Deliverability Suite</strong> key ($19.99/mo —
        unlocks all 5 deliverability APIs, QA mailboxes, and Pro inbox with one key) or a
        standalone Sender Check key. <Link to="/pro">Compare all 4 plans</Link>.
      </p>
      <pre className="tool-curl-preview" data-testid="sender-curl-preview">
        <code>{CURL_SNIPPET}</code>
      </pre>
      <div className="tool-mcp-onboarding">
        <p className="tool-mcp-label">Connect via MCP (Claude / Cursor / Antigravity)</p>
        <pre className="tool-mcp-preview" data-testid="mcp-config-snippet">
          <code>{MCP_SNIPPET}</code>
        </pre>
      </div>
      {confirming ? <p role="status">Confirming payment…</p> : null}
      {offer ? (
        <p className="sender-offer-price" data-testid="sender-price">
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
        Buy the Sender Check API
      </button>
      {license ? (
        <div data-testid="sender-license">
          <p>Sender Check is active for this browser ({license.type === 'suite' ? 'Deliverability Suite' : 'Sender Check'}).</p>
          <button type="button" onClick={handleIssue} disabled={busy}>
            {apiKey ? 'Replace API key' : 'Issue API key'}
          </button>
          {apiKey ? <p><code data-testid="sender-api-key">{apiKey}</code></p> : null}
        </div>
      ) : (
        <form className="sender-restore" onSubmit={handleRestore}>
          <label htmlFor="sender-license-key">Already bought? Paste your license key (Suite or Sender Check)</label>
          <input
            id="sender-license-key"
            value={restoreKey}
            onChange={(event) => setRestoreKey(event.target.value)}
            autoComplete="off"
          />
          <button type="submit" disabled={busy || !restoreKey.trim()}>Restore</button>
        </form>
      )}
      {error ? <p className="sender-error" role="alert">{error}</p> : null}
    </section>
  );
};

export default SenderOffer;
